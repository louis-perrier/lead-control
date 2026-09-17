// Serveur uniquement : lit GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET, jetons dans secrets.channel_tokens.
import { admin, logEvent } from './core.ts'
import type { Interval } from './agenda-slots.ts'

const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''
const CALENDAR = 'https://www.googleapis.com/calendar/v3/calendars/primary'
const TIMEOUT_MS = 8000

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.freebusy',
  'https://www.googleapis.com/auth/calendar.events.owned',
]

export type GoogleErrorCode = 'token_expired' | 'unavailable' | 'not_found' | 'conflict' | 'bad_request'

export class GoogleError extends Error {
  constructor(public code: GoogleErrorCode, message: string) {
    super(message)
  }
}

export type GoogleAccount = { id: string; user_id: string; handle: string | null }

// Un compte expiré reste le compte de l'utilisateur : il doit le reconnecter, pas revenir au lien.
export async function findGoogleAccount(userId: string): Promise<GoogleAccount | null> {
  const { data } = await admin
    .from('channel_accounts')
    .select('id, user_id, handle')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .in('status', ['connected', 'expired'])
    .order('status', { ascending: true })
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ?? null
}

async function markExpired(account: GoogleAccount, reason: string) {
  await admin
    .from('channel_accounts')
    .update({ status: 'expired', last_error: reason.slice(0, 200) })
    .eq('id', account.id)
    .neq('status', 'disconnected')
  await logEvent('warn', 'google', `agenda Google à reconnecter : ${reason.slice(0, 200)}`, { user_id: account.user_id })
}

export async function tokenRequest(params: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const payload = await res.json().catch(() => ({}))
  return { ok: res.ok, payload: payload as Record<string, unknown> }
}

// Google ne fait pas tourner le refresh token : deux rafraîchissements simultanés sont sans risque.
export async function getGoogleAccessToken(account: GoogleAccount) {
  const { data } = await admin
    .schema('secrets')
    .from('channel_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('channel_account_id', account.id)
    .maybeSingle()
  if (data?.access_token && data.expires_at && Date.parse(data.expires_at) > Date.now() + 60_000) {
    return data.access_token as string
  }
  if (!data?.refresh_token) {
    await markExpired(account, 'refresh token absent')
    throw new GoogleError('token_expired', 'refresh token absent')
  }
  let res
  try {
    res = await tokenRequest({ grant_type: 'refresh_token', refresh_token: data.refresh_token })
  } catch (e) {
    throw new GoogleError('unavailable', `refresh: ${String(e)}`)
  }
  if (!res.ok || typeof res.payload.access_token !== 'string') {
    if (res.payload.error === 'invalid_grant') {
      await markExpired(account, 'accès retiré ou expiré (invalid_grant)')
      throw new GoogleError('token_expired', 'invalid_grant')
    }
    throw new GoogleError('unavailable', `refresh: ${JSON.stringify(res.payload).slice(0, 200)}`)
  }
  const expiresAt = new Date(Date.now() + Number(res.payload.expires_in ?? 3600) * 1000).toISOString()
  await admin
    .schema('secrets')
    .from('channel_tokens')
    .update({ access_token: res.payload.access_token, expires_at: expiresAt, updated_at: new Date().toISOString() })
    .eq('channel_account_id', account.id)
  await admin
    .from('channel_accounts')
    .update({ status: 'connected', last_error: null, token_expires_at: expiresAt, last_refresh_at: new Date().toISOString() })
    .eq('id', account.id)
    .neq('status', 'disconnected')
  return res.payload.access_token
}

async function call(account: GoogleAccount, token: string, url: string, init: RequestInit = {}) {
  let res: Response
  try {
    res = await fetch(url, {
      ...init,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (e) {
    throw new GoogleError('unavailable', String(e).slice(0, 200))
  }
  const body = await res.json().catch(() => ({}))
  if (res.ok) return body
  const detail = JSON.stringify(body).slice(0, 200)
  if (res.status === 401) {
    await markExpired(account, `401 ${detail}`)
    throw new GoogleError('token_expired', detail)
  }
  if (res.status === 404 || res.status === 410) throw new GoogleError('not_found', detail)
  if (res.status === 409) throw new GoogleError('conflict', detail)
  if (res.status === 400) throw new GoogleError('bad_request', detail)
  throw new GoogleError('unavailable', `${res.status} ${detail}`)
}

export async function freeBusy(account: GoogleAccount, token: string, from: number, to: number): Promise<Interval[]> {
  const body = await call(account, token, 'https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    body: JSON.stringify({
      timeMin: new Date(from).toISOString(),
      timeMax: new Date(to).toISOString(),
      items: [{ id: 'primary' }],
    }),
  })
  const primary = body?.calendars?.primary
  // Google répond 200 même quand l'agenda n'a pas pu être lu : l'erreur est dans le corps.
  if (!primary || (Array.isArray(primary.errors) && primary.errors.length > 0)) {
    throw new GoogleError('unavailable', `freeBusy: ${JSON.stringify(primary?.errors ?? body).slice(0, 200)}`)
  }
  return (primary.busy ?? []).map((b: { start: string; end: string }) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }))
}

export type CalendarEvent = {
  id: string
  status?: string
  hangoutLink?: string
  attendees?: { email?: string }[]
  start?: { dateTime?: string }
  end?: { dateTime?: string }
  conferenceData?: {
    createRequest?: { status?: { statusCode?: string } }
    entryPoints?: { entryPointType?: string; uri?: string }[]
  }
}

export function meetLinkOf(event: CalendarEvent) {
  return event.hangoutLink ?? event.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ?? null
}

export async function getEvent(account: GoogleAccount, token: string, eventId: string): Promise<CalendarEvent> {
  return await call(account, token, `${CALENDAR}/events/${encodeURIComponent(eventId)}`)
}

// Identifiant en base32hex (0-9, a-v) : le même appel rejoué tombe sur un 409 au lieu d'un doublon.
export function eventIdFor(conversationId: number, start: number, attempt = 0) {
  return `lc${conversationId.toString(32)}t${Math.floor(start / 60_000).toString(32)}${attempt ? `r${attempt}` : ''}`
}

export async function createMeetEvent(opts: {
  account: GoogleAccount
  token: string
  conversationId: number
  start: number
  end: number
  timeZone: string
  summary: string
  description: string
  email: string | null
}) {
  const { account, token } = opts
  const insert = (eventId: string, email: string | null) =>
    call(
      account,
      token,
      `${CALENDAR}/events?conferenceDataVersion=1&sendUpdates=${email ? 'all' : 'none'}`,
      {
        method: 'POST',
        body: JSON.stringify({
          id: eventId,
          summary: opts.summary,
          description: opts.description,
          start: { dateTime: new Date(opts.start).toISOString(), timeZone: opts.timeZone },
          end: { dateTime: new Date(opts.end).toISOString(), timeZone: opts.timeZone },
          attendees: email ? [{ email }] : [],
          conferenceData: { createRequest: { requestId: eventId, conferenceSolutionKey: { type: 'hangoutsMeet' } } },
          extendedProperties: { private: { leadcontrol_conversation: String(opts.conversationId) } },
        }),
      },
    ) as Promise<CalendarEvent>

  let emailRejected = false
  let event: CalendarEvent | null = null
  for (let attempt = 0; attempt < 3 && !event; attempt++) {
    const eventId = eventIdFor(opts.conversationId, opts.start, attempt)
    try {
      event = await insert(eventId, emailRejected ? null : opts.email)
    } catch (e) {
      if (e instanceof GoogleError && e.code === 'bad_request' && opts.email && !emailRejected) {
        emailRejected = true
        attempt -= 1
        continue
      }
      // Délai dépassé ou id déjà pris : l'événement a pu être créé, on le relit avant de conclure.
      if (!(e instanceof GoogleError) || (e.code !== 'conflict' && e.code !== 'unavailable')) throw e
      const existing = await getEvent(account, token, eventId).catch((err) => {
        if (err instanceof GoogleError && err.code === 'not_found') return null
        throw err
      })
      if (existing && existing.status !== 'cancelled') event = existing
      else if (e.code === 'unavailable') throw e
    }
  }
  if (!event) throw new GoogleError('conflict', 'identifiants d’événement épuisés')

  if (!meetLinkOf(event) && event.conferenceData?.createRequest?.status?.statusCode === 'pending') {
    await new Promise((r) => setTimeout(r, 1000))
    event = await getEvent(account, token, event.id).catch(() => event!)
  }
  const invited = Boolean(
    opts.email && event.attendees?.some((a) => a.email?.toLowerCase() === opts.email!.toLowerCase()),
  )
  return { event, meetLink: meetLinkOf(event), invited }
}

export async function revokeGoogleToken(token: string) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => {})
}
