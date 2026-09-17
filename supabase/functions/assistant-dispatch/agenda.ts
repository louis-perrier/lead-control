// Mode agenda : plages libres du tour, puis outils de vérification et de réservation.
// Les erreurs Google ne remontent jamais : le modèle reçoit une consigne de repli.
import { admin, logEvent } from '../_shared/core.ts'
import {
  AGENDA_HORIZON_MS,
  checkSlot,
  computeOffers,
  momentLabel,
  nextOfferStep,
  normalizeAgenda,
  nowLabel,
  offersKey,
  timezoneLabel,
  type Interval,
  type Offer,
  type SlotCheck,
  type SlotRefusal,
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
  prompt: AgendaPromptContext
  tools: typeof AGENDA_TOOLS
  runTool: RunTool
  storedOffers: { key: string; offers: Offer[] }
  result: { booking: AgendaBooking | null; bookedThisTurn: boolean; failure: AgendaFailure | null }
}

export const FAILURE_MESSAGES: Record<AgendaFailure, string> = {
  calendar_token_expired: 'Reconnectez Google Agenda : l’assistant n’a pas pu fixer l’appel avec ce prospect.',
  calendar_unavailable: 'Google Agenda ne répond pas : l’assistant n’a pas pu fixer l’appel, reprenez la main.',
}

const REFUSALS: Record<SlotRefusal, string> = {
  format: 'heure illisible, utilise le format AAAA-MM-JJTHH:MM avec des minutes multiples de 15',
  nonexistent: 'cette heure n’existe pas ce jour-là (changement d’heure)',
  too_soon: 'trop proche, il faut au moins 2 h de délai',
  too_far: 'plus de 14 jours à l’avance',
  outside_hours: 'en dehors des jours et heures d’appel',
  busy: 'l’agenda est déjà pris à ce moment',
}

const FALLBACK = 'L’agenda est inaccessible : dis au prospect que tu reviens vers lui très vite pour fixer l’appel, sans rien confirmer.'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function agendaEnabled(userId: string, settings: Record<string, any>) {
  if (settings.booking?.mode !== 'calendar') return false
  const { data } = await admin.rpc('user_has_feature', { p_user: userId, p_key: 'google_calendar' })
  return data === true
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

export async function prepareAgendaTurn(opts: {
  userId: string
  convId: number
  tz: string
  settings: Record<string, any>
  metadata: Record<string, unknown>
  sentTexts: string[]
  contactName: string
  contactHandle: string | null
}): Promise<AgendaTurn> {
  const { userId, convId, tz } = opts
  const s = normalizeAgenda(opts.settings.booking?.calendar)
  const key = offersKey(s, tz)
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

  const stored = opts.metadata.agenda_offers as { key?: string; offers?: Offer[] } | undefined
  const keep = stored?.key === key && Array.isArray(stored.offers) ? stored.offers : []
  const offers = busy ? computeOffers({ now, tz, settings: s, busy, keep }) : keep
  const step = busy ? nextOfferStep(offers, s, opts.sentTexts, tz) : null

  let booked: AgendaPromptContext['booked'] = null
  if (result.booking) {
    const link = result.booking.meet_link
    booked = {
      label: momentLabel(Date.parse(result.booking.event_start_at), tz),
      confirmed: link ? await meetLinkSent(convId, link) : false,
    }
  }

  async function ensureAccess(): Promise<{ account: GoogleAccount; token: string } | ToolOutcome> {
    if (!account) {
      result.failure = 'calendar_token_expired'
      return { content: FALLBACK, isError: true }
    }
    if (!token) {
      try {
        token = await getGoogleAccessToken(account)
      } catch (e) {
        result.failure = e instanceof GoogleError && e.code === 'token_expired' ? 'calendar_token_expired' : 'calendar_unavailable'
        return { content: FALLBACK, isError: true }
      }
    }
    return { account, token }
  }

  async function busyAround(access: { account: GoogleAccount; token: string }, from: number, to: number) {
    return await freeBusy(access.account, access.token, from, to)
  }

  function failWith(e: unknown): ToolOutcome {
    result.failure = e instanceof GoogleError && e.code === 'token_expired' ? 'calendar_token_expired' : 'calendar_unavailable'
    return { content: FALLBACK, isError: true }
  }

  const runTool: RunTool = async (name, input) => {
    const debut = typeof input.debut === 'string' ? input.debut : ''
    const access = await ensureAccess()
    if ('content' in access) return access

    if (name === 'verifier_creneau') {
      try {
        const current = busy ?? (await busyAround(access, Date.now(), Date.now() + AGENDA_HORIZON_MS))
        return { content: describeCheck(checkSlot({ value: debut, now: Date.now(), tz, settings: s, busy: current })) }
      } catch (e) {
        return failWith(e)
      }
    }

    if (name !== 'reserver_appel') return { content: 'Outil inconnu.', isError: true }

    if (result.booking) {
      const label = momentLabel(Date.parse(result.booking.event_start_at), tz)
      return { content: `Déjà réservé : ${label}. Confirme-le au prospect sans rien proposer d’autre.` }
    }
    const rawEmail = typeof input.email === 'string' ? input.email.trim() : ''
    if (rawEmail && !EMAIL_RE.test(rawEmail)) {
      return { content: 'E-mail invalide : redemande-le une fois, ou réserve avec email à null s’il ne veut pas le donner.', isError: true }
    }
    const email = rawEmail || null

    try {
      // Relecture fraîche de l'agenda : la plage a pu se remplir depuis le début du tour.
      const current = await busyAround(access, Date.now(), Date.now() + AGENDA_HORIZON_MS)
      const check = checkSlot({ value: debut, now: Date.now(), tz, settings: s, busy: current })
      if (!check.ok) return { content: describeCheck(check) }

      const who = opts.contactName || (opts.contactHandle ? `@${opts.contactHandle}` : 'prospect Instagram')
      const created = await createMeetEvent({
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

      const row = {
        user_id: userId,
        conversation_id: convId,
        provider: 'google',
        external_event_id: created.event.id,
        event_type_name: `Appel de ${s.duration_min} min`,
        invitee_email: created.emailRejected ? null : email,
        invitee_name: who,
        event_start_at: new Date(check.start).toISOString(),
        event_end_at: new Date(check.end).toISOString(),
        meet_link: created.meetLink,
        status: 'active',
        raw_payload: { event_id: created.event.id, email_rejected: created.emailRejected },
      }
      const inserted = await admin.from('bookings').insert(row).select('id, event_start_at, meet_link').single()
      // Un essai précédent du même tour a déjà enregistré la réservation.
      result.booking = inserted.data ?? (await activeGoogleBooking(convId))
      if (!result.booking) throw new Error(`bookings: ${inserted.error?.message}`)
      result.bookedThisTurn = true

      if (!created.meetLink) {
        await notifyNeedsYou(userId, convId, 'Appel réservé sans lien Meet : envoyez le lien de visio au prospect.')
      }
      const invite = created.emailRejected
        ? 'Google a refusé l’e-mail : pas d’invitation, le lien de la visio part en message.'
        : email
          ? `Invitation envoyée à ${email}, le lien de la visio part aussi en message.`
          : 'Sans e-mail : le lien de la visio part en message.'
      return { content: `Réservé : ${check.label}. ${invite}` }
    } catch (e) {
      await logEvent('error', 'assistant-dispatch', `réservation Google impossible conv=${convId}: ${String(e).slice(0, 300)}`, {
        user_id: userId,
        conversation_id: convId,
      })
      return failWith(e)
    }
  }

  return {
    prompt: { durationMin: s.duration_min, now: nowLabel(now, tz), timezone: timezoneLabel(tz), step, booked },
    tools: AGENDA_TOOLS,
    runTool,
    storedOffers: { key, offers },
    result,
  }
}
