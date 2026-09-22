// Message Slack quand un appel est réservé. Appelée seulement par le déclencheur posé sur
// bookings, avec le jeton machine : jamais depuis le navigateur.
import { admin, handleOptions, isCronCall, json, logEvent } from '../_shared/core.ts'
import { slackBookingText, slackGone, type SlackBooking, type SlackConversation } from './message.ts'

async function notify(bookingId: string) {
  const { data } = await admin
    .from('bookings')
    .select('user_id, conversation_id, invitee_name, invitee_email, event_start_at, raw_payload')
    .eq('id', bookingId)
    .maybeSingle()
  const booking = data as (SlackBooking & { user_id: string }) | null
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

  let conv: SlackConversation | null = null
  if (booking.conversation_id) {
    const { data } = await admin
      .from('conversations')
      .select('provider, contact_name, contact_handle, summary')
      .eq('id', booking.conversation_id)
      .maybeSingle()
    conv = data as SlackConversation | null
  }

  const res = await fetch(hookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: slackBookingText(booking, conv, tz) }),
    signal: AbortSignal.timeout(8000),
  })
  if (res.ok) return

  const detail = (await res.text().catch(() => '')).slice(0, 120)
  await logEvent('warn', 'slack-notify', `message Slack refusé (${res.status}) : ${detail}`, { user_id: booking.user_id })
  if (slackGone(res.status, detail)) {
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
