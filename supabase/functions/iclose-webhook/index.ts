// Réception des réservations iClose, y compris celles que le prospect fait lui-même depuis le
// lien envoyé. iClose ne signe pas ses envois : le secret voyage dans le chemin de l'URL
// enregistrée chez iClose, et rien n'est traité sans lui.
import { admin, handleOptions, json, logEvent } from '../_shared/core.ts'

const WEBHOOK_SECRET = Deno.env.get('ICLOSE_WEBHOOK_SECRET') ?? ''

function secretMatches(path: string) {
  if (!WEBHOOK_SECRET) return false
  const given = path.split('/').filter(Boolean).pop() ?? ''
  if (given.length !== WEBHOOK_SECRET.length) return false
  let diff = 0
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ WEBHOOK_SECRET.charCodeAt(i)
  return diff === 0
}

function read(source: unknown, ...keys: string[]) {
  const r = (source ?? {}) as Record<string, unknown>
  for (const k of keys) {
    const v = r[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number') return String(v)
  }
  return ''
}

function isoOf(value: string) {
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

function callIdOf(payload: Record<string, unknown>) {
  const event = payload.event as Record<string, unknown> | undefined
  return read(event, 'id', 'callId', 'eventCallId') || read(payload, 'id', 'callId', 'eventCallId')
}

async function handleBooked(payload: Record<string, unknown>) {
  const event = (payload.event ?? {}) as Record<string, unknown>
  const eventType = (payload.event_type ?? {}) as Record<string, unknown>
  const invitee = (payload.invitee ?? {}) as Record<string, unknown>
  const tracking = (payload.tracking ?? {}) as Record<string, unknown>

  const callId = callIdOf(payload)
  if (!callId) return

  // L'assistant a déjà écrit sa ligne quand c'est lui qui a réservé : on sort avant tout le
  // reste, sinon chaque réservation faite par l'agent laisserait un avertissement inutile.
  const { data: known } = await admin
    .from('bookings')
    .select('id')
    .eq('provider', 'iclose')
    .eq('external_event_id', callId)
    .maybeSingle()
  if (known) return

  const utmContent = read(tracking, 'utm_content')
  const conversationId = utmContent && /^\d+$/.test(utmContent) ? Number(utmContent) : null

  let userId: string | null = null
  if (conversationId) {
    const { data: conv } = await admin.from('conversations').select('user_id').eq('id', conversationId).maybeSingle()
    userId = conv?.user_id ?? null
  }
  if (!userId) {
    await logEvent('warn', 'iclose-webhook', 'réservation sans conversation identifiable (utm_content absent ou invalide)', {
      payload,
    })
    return
  }

  // Un rendez-vous déplacé arrive comme une nouvelle réservation : l'ancienne de cette
  // conversation est close d'abord, sinon l'index d'un seul appel actif la refuse.
  await admin
    .from('bookings')
    .update({ status: 'canceled' })
    .eq('conversation_id', conversationId)
    .eq('provider', 'iclose')
    .eq('status', 'active')

  const start = read(event, 'utc_start_time', 'start_time', 'startTime', 'dateTime')
  const end = read(event, 'utc_end_time', 'end_time', 'endTime')
  const join = read(event, 'eventLink', 'location', 'joinUrl')

  const inserted = await admin.from('bookings').insert({
    user_id: userId,
    conversation_id: conversationId,
    provider: 'iclose',
    event_type_uri: read(eventType, 'slug', 'linkPrefix'),
    event_type_name: read(eventType, 'name', 'title'),
    invitee_email: read(invitee, 'email'),
    invitee_name: read(invitee, 'name', 'fullName'),
    external_event_id: callId,
    event_start_at: isoOf(start),
    event_end_at: isoOf(end),
    meet_link: join.startsWith('http') ? join : null,
    status: 'active',
    raw_payload: payload,
  })
  if (inserted.error) {
    await logEvent('error', 'iclose-webhook', `réservation non enregistrée call=${callId}: ${inserted.error.message}`, {
      user_id: userId,
      conversation_id: conversationId ?? undefined,
    })
  }

  await admin
    .from('conversations')
    .update({
      automation_state: 'condition_stop',
      automation_reason: 'iclose_booked',
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
}

async function handleCancelled(payload: Record<string, unknown>) {
  const callId = callIdOf(payload)
  if (!callId) return

  const { data: booking } = await admin
    .from('bookings')
    .select('id, conversation_id')
    .eq('provider', 'iclose')
    .eq('external_event_id', callId)
    .maybeSingle()
  if (!booking) return

  await admin.from('bookings').update({ status: 'canceled', raw_payload: payload }).eq('id', booking.id)
  if (!booking.conversation_id) return

  const { data: others } = await admin
    .from('bookings')
    .select('id')
    .eq('conversation_id', booking.conversation_id)
    .eq('status', 'active')
    .limit(1)
  if ((others?.length ?? 0) > 0) return

  await admin
    .from('conversations')
    .update({ automation_state: 'idle', automation_reason: 'iclose_canceled', updated_at: new Date().toISOString() })
    .eq('id', booking.conversation_id)
    .eq('automation_state', 'condition_stop')
}

Deno.serve(async (req) => {
  const opt = handleOptions(req)
  if (opt) return opt
  if (req.method !== 'POST') return json(req, { error: 'Not found' }, 404)
  if (!secretMatches(new URL(req.url).pathname)) return json(req, { error: 'invalid_secret' }, 401)

  let payload: Record<string, unknown> = {}
  try {
    payload = (await req.json()) as Record<string, unknown>
  } catch {
    return json(req, { error: 'invalid_body' }, 400)
  }

  const hook = read(payload, 'hookType', 'event_type_id', 'trigger')
  try {
    if (hook === 'newCallScheduled' || hook === 'callRescheduled') await handleBooked(payload)
    else if (hook === 'callCancelled') await handleCancelled(payload)
    else return json(req, { ok: true, handled: false })
    return json(req, { ok: true, handled: true })
  } catch (e) {
    await logEvent('error', 'iclose-webhook', `traitement échoué: ${String(e).slice(0, 300)}`)
    return json(req, { ok: true, handled: false })
  }
})
