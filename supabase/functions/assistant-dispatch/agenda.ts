// Mode agenda : plages libres du tour, puis outils de vérification et de réservation.
// Les erreurs Google ne remontent jamais : le modèle reçoit une consigne de repli.
import { admin, logEvent } from '../_shared/core.ts'
import {
  AGENDA_HORIZON_MS,
  checkSlot,
  isValidTimezone,
  momentLabel,
  normalizeAgenda,
  nowLabel,
  planOffers,
  recordSentOffers,
  timezoneLabel,
  type Interval,
  type OfferStep,
  type SlotCheck,
  type SlotRefusal,
  type StoredOffers,
} from '../_shared/agenda-slots.ts'
import {
  GoogleError,
  createMeetEvent,
  findGoogleAccount,
  freeBusy,
  getGoogleAccessToken,
  type GoogleAccount,
} from '../_shared/google.ts'
import { notifyNeedsYou } from '../_shared/notify.ts'
import type { RunTool, ToolOutcome } from '../_shared/tool-loop.ts'
import { AGENDA_TOOLS, type AgendaPromptContext } from './agenda-prompt.ts'

export type AgendaBooking = { id: string; event_start_at: string; meet_link: string | null }
export type AgendaFailure = 'calendar_token_expired' | 'calendar_unavailable'

export type AgendaTurn = {
  timezone: string
  prompt: AgendaPromptContext
  tools: typeof AGENDA_TOOLS
  runTool: RunTool
  storedOffers: StoredOffers | null
  step: OfferStep | null
  recordSent: (texts: string[]) => StoredOffers | null
  result: { booking: AgendaBooking | null; bookedThisTurn: boolean; failure: AgendaFailure | null }
}

export const FAILURE_MESSAGES: Record<AgendaFailure, string> = {
  calendar_token_expired: 'Reconnectez Google Agenda : l’assistant n’a pas pu fixer l’appel avec ce prospect.',
  calendar_unavailable: 'Google Agenda ne répond pas : l’assistant n’a pas pu fixer l’appel, reprenez la main.',
}

// Dernier tour de la boucle, sans outil : rien ne doit être confirmé à ce moment-là.
export const LAST_ROUND_NOTE =
  'Plus aucun outil n’est disponible pour ce message : ne confirme aucun rendez-vous qui n’a pas été réservé par reserver_appel.'

const REFUSALS: Record<SlotRefusal, string> = {
  format: 'heure illisible, utilise le format AAAA-MM-JJTHH:MM avec des minutes multiples de 15',
  nonexistent: 'cette heure n’existe pas ce jour-là (changement d’heure)',
  too_soon: 'trop proche, il faut au moins 2 h de délai',
  too_far: 'plus de 14 jours à l’avance',
  outside_hours: 'en dehors des jours et heures d’appel',
  busy: 'l’agenda est déjà pris à ce moment',
}

const BOOKING_FALLBACK =
  'L’agenda est inaccessible : dis au prospect que tu reviens vers lui très vite pour fixer l’appel, sans rien confirmer.'
const CHECK_FALLBACK =
  'L’agenda ne peut pas être lu pour le moment : ne confirme aucune heure, continue l’échange et propose d’y revenir.'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Sans compte Google (jamais relié ou déconnecté), l'assistant garde le lien.
export async function agendaEnabled(userId: string, settings: Record<string, any>) {
  if (settings.booking?.mode !== 'calendar') return false
  const { data } = await admin.rpc('user_has_feature', { p_user: userId, p_key: 'google_calendar' })
  if (data !== true) return false
  return Boolean(await findGoogleAccount(userId))
}

export async function activeGoogleBooking(convId: number): Promise<AgendaBooking | null> {
  const { data } = await admin
    .from('bookings')
    .select('id, event_start_at, meet_link')
    .eq('conversation_id', convId)
    .eq('provider', 'google')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  return data ?? null
}

export async function meetLinkSent(convId: number, link: string) {
  const { data } = await admin
    .from('conversation_messages')
    .select('id')
    .eq('conversation_id', convId)
    .eq('author_type', 'agent')
    .eq('send_state', 'sent')
    .ilike('body_text', `%${link}%`)
    .limit(1)
  return (data?.length ?? 0) > 0
}

function describeCheck(check: SlotCheck) {
  if (check.ok) return `Libre : ${check.label}.`
  const alts = check.alternatives.map((a) => `${a.label} (${a.debut})`).join(', ')
  return `Indisponible : ${REFUSALS[check.reason]}. Moments libres proches : ${alts || 'aucun dans les 14 prochains jours'}.`
}

// Le nom vient du profil Instagram du prospect : il finit dans l'invitation envoyée par le compte.
function safeName(name: string) {
  return name.replace(/https?:\/\/\S+|www\.\S+/gi, '').replace(/\s+/g, ' ').trim().slice(0, 60)
}

export async function prepareAgendaTurn(opts: {
  userId: string
  convId: number
  tz: string
  settings: Record<string, any>
  metadata: Record<string, unknown>
  contactName: string
  contactHandle: string | null
}): Promise<AgendaTurn> {
  const { userId, convId } = opts
  const tz = isValidTimezone(opts.tz) ? opts.tz : 'Europe/Paris'
  if (tz !== opts.tz) {
    await logEvent('warn', 'assistant-dispatch', `fuseau invalide « ${opts.tz} », Europe/Paris utilisé`, { user_id: userId })
  }
  const s = normalizeAgenda(opts.settings.booking?.calendar)
  const now = Date.now()
  const result: AgendaTurn['result'] = { booking: await activeGoogleBooking(convId), bookedThisTurn: false, failure: null }

  const account: GoogleAccount | null = await findGoogleAccount(userId)
  let token: string | null = null
  let busy: Interval[] | null = null
  if (account) {
    try {
      token = await getGoogleAccessToken(account)
      busy = await freeBusy(account, token, now, now + AGENDA_HORIZON_MS)
    } catch (e) {
      await logEvent('warn', 'assistant-dispatch', `agenda illisible conv=${convId}: ${String(e).slice(0, 200)}`, {
        user_id: userId,
        conversation_id: convId,
      })
    }
  }

  // Agenda illisible : pas de plages ce tour-ci, celles déjà mémorisées restent pour le suivant.
  const planned = busy
    ? planOffers({ now, tz, settings: s, busy, stored: opts.metadata.agenda_offers as Partial<StoredOffers> | undefined })
    : null
  const step = planned?.step ?? null

  let booked: AgendaPromptContext['booked'] = null
  if (result.booking) {
    const link = result.booking.meet_link
    booked = {
      label: momentLabel(Date.parse(result.booking.event_start_at), tz),
      confirmed: link ? await meetLinkSent(convId, link) : false,
    }
  }

  async function ensureAccess(): Promise<{ account: GoogleAccount; token: string } | { error: unknown }> {
    if (!account) return { error: new GoogleError('token_expired', 'aucun compte Google') }
    if (!token) {
      try {
        token = await getGoogleAccessToken(account)
      } catch (e) {
        return { error: e }
      }
    }
    return { account, token }
  }

  function bookingFailed(e: unknown): ToolOutcome {
    result.failure = e instanceof GoogleError && e.code === 'token_expired' ? 'calendar_token_expired' : 'calendar_unavailable'
    return { content: BOOKING_FALLBACK, isError: true }
  }

  async function verify(debut: string): Promise<ToolOutcome> {
    const access = await ensureAccess()
    if ('error' in access) return { content: CHECK_FALLBACK, isError: true }
    try {
      const current = busy ?? (await freeBusy(access.account, access.token, Date.now(), Date.now() + AGENDA_HORIZON_MS))
      return { content: describeCheck(checkSlot({ value: debut, now: Date.now(), tz, settings: s, busy: current })) }
    } catch (_) {
      return { content: CHECK_FALLBACK, isError: true }
    }
  }

  async function reserve(debut: string, rawEmail: string): Promise<ToolOutcome> {
    if (result.booking) {
      const label = momentLabel(Date.parse(result.booking.event_start_at), tz)
      return { content: `Déjà réservé : ${label}. Confirme-le au prospect sans rien proposer d’autre.` }
    }
    if (rawEmail && !EMAIL_RE.test(rawEmail)) {
      return { content: 'E-mail invalide : redemande-le une fois, ou réserve avec email à null s’il ne veut pas le donner.', isError: true }
    }
    const email = rawEmail || null
    const access = await ensureAccess()
    if ('error' in access) return bookingFailed(access.error)

    let check: SlotCheck
    let created: Awaited<ReturnType<typeof createMeetEvent>>
    try {
      // Relecture fraîche de l'agenda : la plage a pu se remplir depuis le début du tour.
      const current = await freeBusy(access.account, access.token, Date.now(), Date.now() + AGENDA_HORIZON_MS)
      check = checkSlot({ value: debut, now: Date.now(), tz, settings: s, busy: current })
      if (!check.ok) return { content: describeCheck(check) }
      const who = safeName(opts.contactName) || (opts.contactHandle ? `@${opts.contactHandle}` : 'prospect Instagram')
      created = await createMeetEvent({
        account: access.account,
        token: access.token,
        conversationId: convId,
        start: check.start,
        end: check.end,
        timeZone: tz,
        summary: `Appel avec ${who}`,
        description: [
          'Réservé depuis une conversation Instagram.',
          opts.contactHandle ? `Instagram : @${opts.contactHandle}` : null,
          email ? `E-mail : ${email}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
        email,
      })
    } catch (e) {
      await logEvent('error', 'assistant-dispatch', `réservation Google impossible conv=${convId}: ${String(e).slice(0, 300)}`, {
        user_id: userId,
        conversation_id: convId,
      })
      return bookingFailed(e)
    }

    const row = {
      user_id: userId,
      conversation_id: convId,
      provider: 'google',
      external_event_id: created.event.id,
      event_type_name: `Appel Meet de ${s.duration_min} min`,
      invitee_email: created.invited ? email : null,
      invitee_name: safeName(opts.contactName) || opts.contactHandle || null,
      event_start_at: new Date(check.start).toISOString(),
      event_end_at: new Date(check.end).toISOString(),
      meet_link: created.meetLink,
      status: 'active',
      raw_payload: { event_id: created.event.id, account_id: access.account.id, invited: created.invited },
    }
    let inserted = await admin.from('bookings').insert(row).select('id, event_start_at, meet_link').single()
    if (inserted.error) inserted = await admin.from('bookings').insert(row).select('id, event_start_at, meet_link').single()
    // L'événement existe et l'invitation est peut-être partie : on confirme quand même au prospect.
    result.booking = inserted.data ?? (await activeGoogleBooking(convId)) ?? {
      id: '',
      event_start_at: row.event_start_at,
      meet_link: created.meetLink,
    }
    result.bookedThisTurn = true
    if (!inserted.data) {
      await logEvent('error', 'assistant-dispatch', `réservation Google non enregistrée conv=${convId} event=${created.event.id}: ${inserted.error?.message}`, {
        user_id: userId,
        conversation_id: convId,
      })
    }
    if (!created.meetLink) {
      await notifyNeedsYou(userId, convId, 'Appel réservé sans lien Meet : envoyez le lien de visio au prospect.', { renew: true })
    }
    const invite = created.invited
      ? `Invitation envoyée à ${email}, le lien de la visio part aussi en message.`
      : email
        ? 'L’invitation par e-mail n’a pas pu partir : le lien de la visio part en message.'
        : 'Sans e-mail : le lien de la visio part en message.'
    return { content: `Réservé : ${check.label}. ${invite}` }
  }

  const runTool: RunTool = async (name, input) => {
    const debut = typeof input.debut === 'string' ? input.debut : ''
    if (name === 'verifier_creneau') return await verify(debut)
    if (name === 'reserver_appel') return await reserve(debut, typeof input.email === 'string' ? input.email.trim() : '')
    return { content: 'Outil inconnu.', isError: true }
  }

  return {
    timezone: tz,
    prompt: { durationMin: s.duration_min, now: nowLabel(now, tz), timezone: timezoneLabel(tz), step, booked },
    tools: AGENDA_TOOLS,
    runTool,
    storedOffers: planned?.stored ?? null,
    step,
    recordSent: (texts) => (planned ? recordSentOffers(planned.stored, step, texts, tz) : null),
    result,
  }
}
