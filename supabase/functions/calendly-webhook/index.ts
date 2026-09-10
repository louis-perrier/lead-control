// Réception des réservations Calendly. Signature HMAC vérifiée sur chaque
// appel : CALENDLY_WEBHOOK_SECRET, jamais de traitement sans elle en prod.
import { admin, handleOptions, json, logEvent } from '../_shared/core.ts'

const CALENDLY_WEBHOOK_SECRET = Deno.env.get('CALENDLY_WEBHOOK_SECRET') ?? ''

async function verifySignature(req: Request, body: string) {
  if (!CALENDLY_WEBHOOK_SECRET) return true
  const signature = req.headers.get('Calendly-Webhook-Signature')
  if (!signature) return false
  const parts = Object.fromEntries(signature.split(',').map((p) => p.split('=') as [string, string]))
  const timestamp = parts['t']
  const hmac = parts['v1']
  if (!timestamp || !hmac) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(CALENDLY_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signatureBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`))
  const computed = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return computed === hmac
}

async function handleInviteeCreated(payload: Record<string, unknown>) {
  const p = payload.payload as Record<string, unknown>
  const tracking = p.tracking as Record<string, unknown> | undefined
  const utmContent = tracking?.utm_content as string | undefined
  const conversationId = utmContent ? Number(utmContent) : null

  let userId: string | null = null
  if (conversationId) {
    const { data: conv } = await admin.from('conversations').select('user_id').eq('id', conversationId).maybeSingle()
    userId = conv?.user_id ?? null
  }

  if (!userId) {
    await logEvent('warn', 'calendly-webhook', 'réservation sans conversation identifiable (utm_content absent ou invalide)', {
      payload: payload as Record<string, unknown>,
    })
    return
  }

  const eventUri = p.event as string | undefined
  const eventRes = eventUri
    ? await admin
        .from('bookings')
        .select('id')
        .eq('event_uri', eventUri)
        .maybeSingle()
    : { data: null }
  if (eventRes.data) return

  await admin.from('bookings').insert({
    user_id: userId,
    conversation_id: conversationId,
    event_type_uri: (p.event_type as string) ?? null,
    event_type_name: (p.name as string) ?? null,
    invitee_email: (p.email as string) ?? null,
    invitee_name: (p.name as string) ?? null,
    event_uri: eventUri ?? null,
    status: 'active',
    raw_payload: payload,
  })

  if (conversationId) {
    await admin
      .from('conversations')
      .update({
        automation_state: 'condition_stop',
        automation_reason: 'calendly_booked',
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
  }
}

async function handleInviteeCanceled(payload: Record<string, unknown>) {
  const p = payload.payload as Record<string, unknown>
  const eventUri = p.event as string | undefined
  if (!eventUri) return

  const { data: booking } = await admin
    .from('bookings')
    .select('id, conversation_id')
    .eq('event_uri', eventUri)
    .maybeSingle()
  if (!booking) return

  await admin.from('bookings').update({ status: 'canceled', raw_payload: payload }).eq('id', booking.id)

  if (booking.conversation_id) {
    await admin
      .from('conversations')
      .update({ automation_state: 'idle', automation_reason: 'calendly_canceled', updated_at: new Date().toISOString() })
      .eq('id', booking.conversation_id)
      .eq('automation_state', 'condition_stop')
  }
}

Deno.serve(async (req) => {
  const opt = handleOptions(req)
  if (opt) return opt
  if (req.method !== 'POST') return json(req, { error: 'Not found' }, 404)

  const bodyText = await req.text()
  if (!(await verifySignature(req, bodyText))) {
    return json(req, { error: 'invalid_signature' }, 401)
  }

  let payload: Record<string, unknown> = {}
  try {
    payload = JSON.parse(bodyText)
  } catch {
    return json(req, { error: 'invalid_body' }, 400)
  }

  try {
    if (payload.event === 'invitee.created') await handleInviteeCreated(payload)
    else if (payload.event === 'invitee.canceled') await handleInviteeCanceled(payload)
    else return json(req, { ok: true, handled: false })
    return json(req, { ok: true, handled: true })
  } catch (e) {
    await logEvent('error', 'calendly-webhook', `traitement échoué: ${String(e).slice(0, 300)}`)
    return json(req, { ok: true, handled: false })
  }
})
