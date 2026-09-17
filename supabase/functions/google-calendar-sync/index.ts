// Cron quotidien : Google ne prévient pas quand un rendez-vous est supprimé ou déplacé dans
// l'agenda, on relit donc les réservations à venir.
import { admin, isCronCall, json, logEvent } from '../_shared/core.ts'
import { GoogleError, findGoogleAccount, getEvent, getGoogleAccessToken, meetLinkOf } from '../_shared/google.ts'

// Une passe par jour : au-delà, le reste est repris la nuit suivante.
const TIME_BUDGET_MS = 100_000

type BookingRow = {
  id: string
  user_id: string
  conversation_id: number | null
  external_event_id: string
  event_start_at: string | null
  event_end_at: string | null
  meet_link: string | null
  raw_payload: { account_id?: string } | null
}

async function cancelBooking(b: BookingRow) {
  await admin.from('bookings').update({ status: 'canceled' }).eq('id', b.id)
  if (b.conversation_id) {
    await admin
      .from('conversations')
      .update({ automation_state: 'idle', automation_reason: 'calendar_canceled', updated_at: new Date().toISOString() })
      .eq('id', b.conversation_id)
      .eq('automation_state', 'condition_stop')
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  if (!(await isCronCall(req))) return new Response('unauthorized', { status: 401 })

  const { data, error } = await admin
    .from('bookings')
    .select('id, user_id, conversation_id, external_event_id, event_start_at, event_end_at, meet_link, raw_payload')
    .eq('provider', 'google')
    .eq('status', 'active')
    .not('external_event_id', 'is', null)
    .gt('event_end_at', new Date().toISOString())
    .order('event_start_at', { ascending: true })
    .limit(200)
  if (error) return json(req, { error: error.message }, 500)

  const byUser = new Map<string, BookingRow[]>()
  for (const b of (data ?? []) as BookingRow[]) byUser.set(b.user_id, [...(byUser.get(b.user_id) ?? []), b])

  const startedAt = Date.now()
  let canceled = 0
  let moved = 0
  for (const [userId, bookings] of byUser) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break
    const account = await findGoogleAccount(userId)
    if (!account) continue
    let token: string
    try {
      token = await getGoogleAccessToken(account)
    } catch (_) {
      continue
    }
    for (const b of bookings) {
      // Réservé sur un autre compte Google que celui relié aujourd'hui : illisible ici, pas annulé.
      if (b.raw_payload?.account_id !== account.id) continue
      try {
        const event = await getEvent(account, token, b.external_event_id)
        if (event.status === 'cancelled') {
          await cancelBooking(b)
          canceled += 1
          continue
        }
        const start = event.start?.dateTime ? new Date(event.start.dateTime).toISOString() : b.event_start_at
        const end = event.end?.dateTime ? new Date(event.end.dateTime).toISOString() : b.event_end_at
        const link = meetLinkOf(event) ?? b.meet_link
        const sameTime = (a: string | null, z: string | null) => (a && z ? Date.parse(a) === Date.parse(z) : a === z)
        if (!sameTime(start, b.event_start_at) || !sameTime(end, b.event_end_at) || link !== b.meet_link) {
          await admin.from('bookings').update({ event_start_at: start, event_end_at: end, meet_link: link }).eq('id', b.id)
          moved += 1
        }
      } catch (e) {
        if (e instanceof GoogleError && e.code === 'not_found') {
          await cancelBooking(b)
          canceled += 1
        } else if (e instanceof GoogleError && e.code === 'token_expired') {
          break
        } else {
          await logEvent('warn', 'google-calendar-sync', `lecture impossible booking=${b.id}: ${String(e).slice(0, 200)}`, {
            user_id: userId,
            conversation_id: b.conversation_id,
          })
        }
      }
    }
  }
  return json(req, { checked: data?.length ?? 0, canceled, moved })
})
