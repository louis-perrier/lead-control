// Appels à l'API Calendly pour le compte d'un utilisateur relié.
// Le refresh token Calendly est à usage unique et change à chaque rafraîchissement : il est
// réécrit sous condition, et un invalid_grant peut venir d'une invocation concurrente.
import { admin, logEvent } from './core.ts'
import { describeEventType, type EventTypeInfo, type InviteeLocation } from './calendly-event-type.ts'

const CLIENT_ID = Deno.env.get('CALENDLY_CLIENT_ID') ?? ''
const CLIENT_SECRET = Deno.env.get('CALENDLY_CLIENT_SECRET') ?? ''
const API = 'https://api.calendly.com'
const TOKEN_URL = 'https://auth.calendly.com/oauth/token'
const TIMEOUT_MS = 8000
const REFRESH_MARGIN_MS = 10 * 60_000
const MAX_WINDOW_MS = 31 * 86_400_000 - 60_000

export type CalendlyErrorCode = 'token_expired' | 'plan_required' | 'slot_taken' | 'bad_request' | 'unavailable'

export class CalendlyError extends Error {
  code: CalendlyErrorCode
  constructor(code: CalendlyErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

export type CalendlyAccount = { id: string; user_id: string; external_id: string; handle: string | null }

export async function findCalendlyAccount(userId: string): Promise<CalendlyAccount | null> {
  const { data } = await admin
    .from('channel_accounts')
    .select('id, user_id, external_id, handle')
    .eq('user_id', userId)
    .eq('provider', 'calendly')
    .in('status', ['connected', 'expired'])
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ?? null
}

async function markExpired(account: CalendlyAccount, reason: string) {
  await admin
    .from('channel_accounts')
    .update({ status: 'expired', last_error: reason.slice(0, 200) })
    .eq('id', account.id)
    .neq('status', 'disconnected')
  await logEvent('warn', 'calendly', `Calendly à reconnecter : ${reason.slice(0, 200)}`, { user_id: account.user_id })
}

async function readTokens(accountId: string) {
  const { data } = await admin
    .schema('secrets')
    .from('channel_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('channel_account_id', accountId)
    .maybeSingle()
  return data as { access_token: string | null; refresh_token: string | null; expires_at: string | null } | null
}

function stillFresh(row: { access_token: string | null; expires_at: string | null } | null) {
  return Boolean(row?.access_token && row.expires_at && Date.parse(row.expires_at) > Date.now() + REFRESH_MARGIN_MS)
}

async function refreshRequest(refreshToken: string) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`,
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const payload = await res.json().catch(() => ({}))
  return { ok: res.ok, payload: payload as Record<string, unknown> }
}

export async function getCalendlyAccessToken(account: CalendlyAccount) {
  const row = await readTokens(account.id)
  if (stillFresh(row)) return row!.access_token as string
  const previous = row?.refresh_token
  if (!previous) {
    await markExpired(account, 'refresh token absent')
    throw new CalendlyError('token_expired', 'refresh token absent')
  }

  let res
  try {
    res = await refreshRequest(previous)
  } catch (e) {
    throw new CalendlyError('unavailable', `refresh: ${String(e)}`)
  }

  if (!res.ok || typeof res.payload.access_token !== 'string') {
    if (res.payload.error === 'invalid_grant') {
      // Le jeton a pu être consommé par une autre invocation juste avant celle-ci.
      const again = await readTokens(account.id)
      if (again?.refresh_token && again.refresh_token !== previous && stillFresh(again)) {
        return again.access_token as string
      }
      await markExpired(account, 'accès retiré ou expiré (invalid_grant)')
      throw new CalendlyError('token_expired', 'invalid_grant')
    }
    throw new CalendlyError('unavailable', `refresh: ${JSON.stringify(res.payload).slice(0, 200)}`)
  }

  const accessToken = res.payload.access_token
  const expiresAt = new Date(Date.now() + Number(res.payload.expires_in ?? 7200) * 1000).toISOString()
  const rotated = typeof res.payload.refresh_token === 'string' ? res.payload.refresh_token : previous
  // Condition sur l'ancien jeton : une invocation concurrente ne se fait pas écraser.
  await admin
    .schema('secrets')
    .from('channel_tokens')
    .update({ access_token: accessToken, refresh_token: rotated, expires_at: expiresAt, updated_at: new Date().toISOString() })
    .eq('channel_account_id', account.id)
    .eq('refresh_token', previous)
  await admin
    .from('channel_accounts')
    .update({ status: 'connected', last_error: null, token_expires_at: expiresAt, last_refresh_at: new Date().toISOString() })
    .eq('id', account.id)
    .neq('status', 'disconnected')
  return accessToken
}

async function call(account: CalendlyAccount, token: string, path: string, init: RequestInit = {}) {
  let res: Response
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (e) {
    throw new CalendlyError('unavailable', `${path}: ${String(e)}`)
  }
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (res.ok) return payload

  const message = `${String(payload.title ?? '')} ${String(payload.message ?? '')}`.trim().slice(0, 200)
  if (res.status === 401) {
    await markExpired(account, `401 sur ${path}`)
    throw new CalendlyError('token_expired', `401 ${path}`)
  }
  if (res.status === 403) {
    if (/paid|upgrade/i.test(message)) throw new CalendlyError('plan_required', message)
    throw new CalendlyError('token_expired', `403 ${path}: ${message}`)
  }
  if (res.status === 429 || res.status >= 500) throw new CalendlyError('unavailable', `${res.status} ${path}`)
  throw new CalendlyError('bad_request', `${res.status} ${path}: ${message}`)
}

export async function listEventTypes(account: CalendlyAccount, token: string): Promise<EventTypeInfo[]> {
  const params = new URLSearchParams({ user: account.external_id, active: 'true', count: '100' })
  const payload = await call(account, token, `/event_types?${params}`)
  const collection = Array.isArray(payload.collection) ? payload.collection : []
  return collection.map((raw) => describeEventType(raw as Record<string, unknown>))
}

export async function getEventType(account: CalendlyAccount, token: string, uri: string): Promise<EventTypeInfo> {
  const uuid = uri.split('/').pop() ?? ''
  if (!uuid) throw new CalendlyError('bad_request', 'uri de type d’événement vide')
  const payload = await call(account, token, `/event_types/${encodeURIComponent(uuid)}`)
  return describeEventType((payload.resource ?? {}) as Record<string, unknown>)
}

// Créneaux réservables, déjà filtrés par tous les réglages Calendly. Fenêtre de 31 jours au
// plus, et un début jamais dans le passé, sinon l'API refuse la demande.
export async function availableTimes(
  account: CalendlyAccount,
  token: string,
  eventTypeUri: string,
  from: number,
  to: number,
): Promise<number[]> {
  const start = Math.max(from, Date.now() + 60_000)
  const end = Math.min(to, start + MAX_WINDOW_MS)
  if (end <= start) return []
  const params = new URLSearchParams({
    event_type: eventTypeUri,
    start_time: new Date(start).toISOString(),
    end_time: new Date(end).toISOString(),
  })
  const payload = await call(account, token, `/event_type_available_times?${params}`)
  const collection = Array.isArray(payload.collection) ? payload.collection : []
  return collection
    .filter((s) => (s as Record<string, unknown>).status === 'available')
    .map((s) => Date.parse(String((s as Record<string, unknown>).start_time)))
    .filter((ms) => Number.isFinite(ms))
    .sort((a, b) => a - b)
}

export type CreatedInvitee = { inviteeUri: string; eventUri: string }

export async function createInvitee(opts: {
  account: CalendlyAccount
  token: string
  eventTypeUri: string
  start: number
  name: string
  email: string
  timezone: string
  location: InviteeLocation | null
  conversationId: number
}): Promise<CreatedInvitee> {
  const body: Record<string, unknown> = {
    event_type: opts.eventTypeUri,
    start_time: new Date(opts.start).toISOString(),
    invitee: { name: opts.name, email: opts.email, timezone: opts.timezone },
    tracking: { utm_source: 'leadcontrol', utm_content: String(opts.conversationId) },
  }
  if (opts.location) body.location = opts.location

  let payload: Record<string, unknown>
  try {
    payload = await call(opts.account, opts.token, '/invitees', { method: 'POST', body: JSON.stringify(body) })
  } catch (e) {
    // Un créneau parti entre la lecture et la réservation n'est pas une panne : l'agent en propose un autre.
    if (e instanceof CalendlyError && e.code === 'bad_request' && /time|slot|available|booked/i.test(e.message)) {
      throw new CalendlyError('slot_taken', e.message)
    }
    throw e
  }
  const resource = (payload.resource ?? {}) as Record<string, unknown>
  const eventUri = typeof resource.event === 'string' ? resource.event : ''
  if (!eventUri) throw new CalendlyError('unavailable', 'réservation sans référence d’événement')
  return { inviteeUri: typeof resource.uri === 'string' ? resource.uri : '', eventUri }
}

// Le lien de visio est généré après coup : Calendly le marque « processing » un court instant.
export async function joinUrlOf(account: CalendlyAccount, token: string, eventUri: string): Promise<string | null> {
  const uuid = eventUri.split('/').pop() ?? ''
  if (!uuid) return null
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500))
    let payload: Record<string, unknown>
    try {
      payload = await call(account, token, `/scheduled_events/${encodeURIComponent(uuid)}`)
    } catch (_) {
      return null
    }
    const location = ((payload.resource ?? {}) as Record<string, unknown>).location as Record<string, unknown> | undefined
    const join = typeof location?.join_url === 'string' ? location.join_url : ''
    if (join) return join
    if (location?.status !== 'processing') return null
  }
  return null
}
