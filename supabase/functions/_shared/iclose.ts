// Appels à l'API iClose pour le compte d'un utilisateur relié.
// L'accès passe par une clé d'API que le client colle lui-même : elle ne se rafraîchit pas, elle
// est valable ou révoquée. L'API iClose demande un forfait Business ou Enterprise.
import { admin, logEvent } from './core.ts'
import { describeIcloseEvent, listOf, parseAvailabilities, type IcloseEvent } from './iclose-event.ts'
import type { QuestionAnswer } from './booking-fields.ts'

const API = 'https://public.api.iclosed.io'
const TIMEOUT_MS = 8000
const MAX_DATE_CALLS = 3

export type IcloseErrorCode =
  | 'token_invalid'
  | 'plan_required'
  | 'rate_limited'
  | 'bad_request'
  | 'disqualified'
  | 'unavailable'

export class IcloseError extends Error {
  code: IcloseErrorCode
  constructor(code: IcloseErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

export type IcloseAccount = { id: string; user_id: string; external_id: string; handle: string | null }

export async function findIcloseAccount(userId: string): Promise<IcloseAccount | null> {
  const { data } = await admin
    .from('channel_accounts')
    .select('id, user_id, external_id, handle')
    .eq('user_id', userId)
    .eq('provider', 'iclose')
    .in('status', ['connected', 'expired'])
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ?? null
}

async function markExpired(account: IcloseAccount, reason: string) {
  await admin
    .from('channel_accounts')
    .update({ status: 'expired', last_error: reason.slice(0, 200) })
    .eq('id', account.id)
    .neq('status', 'disconnected')
  await logEvent('warn', 'iclose', `clé iClose à refaire : ${reason.slice(0, 200)}`, { user_id: account.user_id })
}

export async function getIcloseKey(account: IcloseAccount): Promise<string> {
  const { data } = await admin
    .schema('secrets')
    .from('channel_tokens')
    .select('access_token')
    .eq('channel_account_id', account.id)
    .maybeSingle()
  const key = (data as { access_token: string | null } | null)?.access_token ?? ''
  if (!key) {
    await markExpired(account, 'clé absente')
    throw new IcloseError('token_invalid', 'clé iClose absente')
  }
  return key
}

// iClose exige le préfixe `iclosed_` en plus du schéma Bearer.
function authHeader(key: string) {
  return key.startsWith('iclosed_') ? `Bearer ${key}` : `Bearer iclosed_${key}`
}

export async function call(
  key: string,
  path: string,
  init: { method?: string; body?: string } = {},
  account?: IcloseAccount,
): Promise<Record<string, unknown>> {
  let res: Response
  try {
    res = await fetch(`${API}${path}`, {
      method: init.method ?? 'GET',
      headers: { authorization: authHeader(key), 'content-type': 'application/json', accept: 'application/json' },
      body: init.body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (e) {
    throw new IcloseError('unavailable', `iClose injoignable : ${String(e).slice(0, 120)}`)
  }

  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (res.ok) return payload

  const detail = JSON.stringify(payload).slice(0, 200)
  if (res.status === 401) {
    if (account) await markExpired(account, detail)
    throw new IcloseError('token_invalid', `clé iClose refusée : ${detail}`)
  }
  if (res.status === 403) throw new IcloseError('plan_required', `accès API refusé : ${detail}`)
  if (res.status === 429) throw new IcloseError('rate_limited', 'trop d’appels à iClose')
  if (res.status >= 500) throw new IcloseError('unavailable', `iClose répond ${res.status}`)
  throw new IcloseError('bad_request', `iClose refuse la demande : ${detail}`)
}

export async function listEvents(key: string, account?: IcloseAccount): Promise<IcloseEvent[]> {
  const payload = await call(key, '/v1/events', {}, account)
  return listOf(payload).map(describeIcloseEvent)
}

export async function getEvent(key: string, eventId: string, account?: IcloseAccount): Promise<IcloseEvent | null> {
  const list = await listEvents(key, account)
  return list.find((e) => e.id === eventId || e.linkPrefix === eventId) ?? null
}

function isoDay(ms: number) {
  return new Date(ms).toISOString().slice(0, 10)
}

// iClose renvoie une fenêtre de dates à partir de `currentDate`, sans dire laquelle : on relance
// à la suite du dernier créneau connu tant que l'horizon n'est pas couvert.
export async function availableTimes(
  key: string,
  linkPrefix: string,
  tz: string,
  from: number,
  to: number,
  account?: IcloseAccount,
): Promise<number[]> {
  const found = new Set<number>()
  let cursor = from
  for (let i = 0; i < MAX_DATE_CALLS && cursor < to; i++) {
    const payload = await call(
      key,
      '/v1/events/eventDates',
      { method: 'POST', body: JSON.stringify({ linkPrefix, timeZone: tz, currentDate: isoDay(cursor) }) },
      account,
    )
    const slots = parseAvailabilities(payload, tz).filter((s) => s >= from && s <= to)
    const fresh = slots.filter((s) => !found.has(s))
    for (const s of slots) found.add(s)
    if (fresh.length === 0) break
    cursor = Math.max(...slots) + 86_400_000
  }
  return [...found].sort((a, b) => a - b)
}

export type IcloseContact = { id: string; disqualified: boolean }

export async function upsertContact(
  key: string,
  contact: { firstName: string; lastName: string; email: string; phoneNumber?: string },
  account?: IcloseAccount,
): Promise<string> {
  const payload = await call(key, '/v1/contacts', { method: 'POST', body: JSON.stringify(contact) }, account)
  const root = (payload.data ?? payload.contact ?? payload) as Record<string, unknown>
  const id = typeof root.id === 'string' ? root.id : String(root.id ?? '')
  if (!id || id === 'undefined') throw new IcloseError('unavailable', 'contact iClose sans identifiant')
  return id
}

// Les réponses passent le filtre de qualification d'iClose : un prospect écarté ne doit pas être
// réservé, c'est le client qui a posé la règle.
export async function sendInviteeAnswers(
  key: string,
  opts: { contactId: string; eventId: string; email: string; name: string; answers: QuestionAnswer[] },
  account?: IcloseAccount,
): Promise<{ disqualified: boolean; conditionalUsers: string }> {
  const body = {
    contactId: opts.contactId,
    eventId: opts.eventId,
    inviteeQuestionAnswers: [
      { type: 'EMAIL', answer: opts.email },
      { type: 'NAME', answer: opts.name },
    ],
    secondaryQuestionsAnswer: opts.answers.map((a) => ({ identifier: a.question, answer: [a.answer] })),
  }
  const payload = await call(key, '/v1/fields/inviteeAnswers', { method: 'POST', body: JSON.stringify(body) }, account)
  const root = (payload.data ?? payload) as Record<string, unknown>
  const users = root.conditionalUsers
  return {
    disqualified: root.isDisqualified === true,
    conditionalUsers: Array.isArray(users) ? users.join(',') : typeof users === 'string' ? users : '',
  }
}

export type CreatedCall = { id: string; joinUrl: string | null }

export async function createEventCall(
  key: string,
  opts: {
    eventId: string
    linkPrefix: string
    contactId: string
    start: number
    timezone: string
    conditionalUsers: string
    conversationId: number
  },
  account?: IcloseAccount,
): Promise<CreatedCall> {
  const body: Record<string, unknown> = {
    eventId: opts.eventId,
    linkPrefix: opts.linkPrefix,
    contactId: opts.contactId,
    dateTime: new Date(opts.start).toISOString(),
    timeZone: opts.timezone,
    tracking: { utm_source: 'leadcontrol', utm_content: String(opts.conversationId) },
  }
  if (opts.conditionalUsers) body.conditionalUsers = opts.conditionalUsers

  const payload = await call(key, '/v1/eventCalls', { method: 'POST', body: JSON.stringify(body) }, account)
  const root = (payload.data ?? payload.eventCall ?? payload) as Record<string, unknown>
  const id = typeof root.id === 'string' ? root.id : String(root.id ?? '')
  if (!id || id === 'undefined') throw new IcloseError('unavailable', 'réservation iClose sans identifiant')
  const join = root.location ?? root.eventLink ?? root.joinUrl
  return { id, joinUrl: typeof join === 'string' && join.startsWith('http') ? join : null }
}

// Enregistrement du webhook au moment de la connexion. iClose ne documente pas cet appel
// publiquement : un échec n'empêche rien, le webhook se pose alors à la main dans iClose.
export async function registerWebhook(key: string, url: string) {
  const body = JSON.stringify({
    url,
    isActive: true,
    triggers: [
      { id: 'newCallScheduled', name: 'Call booked' },
      { id: 'callCancelled', name: 'Call cancelled' },
      { id: 'callRescheduled', name: 'Call rescheduled' },
    ],
  })
  try {
    await call(key, '/v1/webhooks', { method: 'POST', body })
  } catch (e) {
    await logEvent('warn', 'iclose', `webhook iClose non enregistré, à poser à la main : ${String(e).slice(0, 200)}`)
  }
}
