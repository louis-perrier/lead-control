// Message Slack quand un appel est réservé. Appelée seulement par le déclencheur posé sur
// bookings, avec le jeton machine : jamais depuis le navigateur.
import { admin, handleOptions, isCronCall, json, logEvent } from '../_shared/core.ts'

type BookingRow = {
  id: string
  user_id: string
  conversation_id: number | null
  provider: string
  event_type_name: string | null
  invitee_name: string | null
  invitee_email: string | null
  event_start_at: string | null
  meet_link: string | null
  raw_payload: Record<string, unknown> | null
}

const TOOLS: Record<string, string> = { calendly: 'Calendly', iclose: 'iClose', google: 'Google Agenda' }

function momentLabel(iso: string | null, tz: string) {
  if (!iso) return 'date inconnue'
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return 'date inconnue'
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms))
}

function lines(booking: BookingRow, tz: string, handle: string | null) {
  const who = booking.invitee_name || handle || 'Prospect Instagram'
  const out = [`Appel réservé avec ${who}`, `Quand : ${momentLabel(booking.event_start_at, tz)} (${tz})`]
  if (booking.event_type_name) out.push(`Page : ${booking.event_type_name}`)
  out.push(`Outil : ${TOOLS[booking.provider] ?? booking.provider}`)
  if (booking.invitee_email) out.push(`E-mail : ${booking.invitee_email}`)

  const answers = booking.raw_payload?.answers
  if (Array.isArray(answers)) {
    for (const a of answers as { label?: unknown; value?: unknown }[]) {
      if (typeof a?.label === 'string' && typeof a?.value === 'string') out.push(`${a.label} : ${a.value}`)
    }
  }
  if (booking.meet_link) out.push(`Visio : ${booking.meet_link}`)
  return out
}

async function notify(bookingId: string) {
  const { data } = await admin
    .from('bookings')
    .select('id, user_id, conversation_id, provider, event_type_name, invitee_name, invitee_email, event_start_at, meet_link, raw_payload')
    .eq('id', bookingId)
    .maybeSingle()
  const booking = data as BookingRow | null
  if (!booking) return

  const { data: account } = await admin
    .from('channel_accounts')
    .select('id')
    .eq('user_id', booking.user_id)
    .eq('provider', 'slack')
    .eq('status', 'connected')
    .limit(1)
    .maybeSingle()
  if (!account) return

  const { data: token } = await admin
    .schema('secrets')
    .from('channel_tokens')
    .select('access_token')
    .eq('channel_account_id', account.id)
    .maybeSingle()
  const hookUrl = (token as { access_token: string | null } | null)?.access_token ?? ''
  if (!hookUrl) return

  const { data: profile } = await admin.from('profiles').select('timezone').eq('user_id', booking.user_id).maybeSingle()
  const tz = profile?.timezone || 'Europe/Paris'

  let handle: string | null = null
  if (booking.conversation_id) {
    const { data: conv } = await admin
      .from('conversations')
      .select('contact_handle')
      .eq('id', booking.conversation_id)
      .maybeSingle()
    handle = conv?.contact_handle ? `@${conv.contact_handle}` : null
  }

  const res = await fetch(hookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: lines(booking, tz, handle).join('\n') }),
    signal: AbortSignal.timeout(8000),
  })
  if (res.ok) return

  const detail = (await res.text().catch(() => '')).slice(0, 120)
  await logEvent('warn', 'slack-notify', `message Slack refusé (${res.status}) : ${detail}`, { user_id: booking.user_id })
  // Slack répond « no_service » quand le client a retiré l'application : le compte est clos.
  if (detail.includes('no_service') || detail.includes('no_team') || res.status === 404) {
    await admin
      .from('channel_accounts')
      .update({ status: 'expired', last_error: detail })
      .eq('id', account.id)
      .neq('status', 'disconnected')
  }
}

Deno.serve(async (req) => {
  const opt = handleOptions(req)
  if (opt) return opt
  if (req.method !== 'POST') return json(req, { error: 'Not found' }, 404)
  if (!(await isCronCall(req))) return json(req, { error: 'Unauthorized' }, 401)

  let body: { booking_id?: string } = {}
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'invalid_body' }, 400)
  }
  if (!body.booking_id) return json(req, { error: 'booking_missing' }, 400)

  try {
    await notify(body.booking_id)
  } catch (e) {
    await logEvent('error', 'slack-notify', `envoi échoué: ${String(e).slice(0, 300)}`)
  }
  return json(req, { ok: true })
})
