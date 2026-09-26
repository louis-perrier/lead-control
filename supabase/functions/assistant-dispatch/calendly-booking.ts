// Mode Calendly : plages du tour lues chez Calendly, puis outils de vérification et de
// réservation. Une panne côté Calendly ne met jamais la conversation en erreur tant qu'aucun
// rendez-vous n'est pris : l'assistant retombe sur l'envoi du lien de réservation.
import { admin, logEvent } from '../_shared/core.ts'
import { checkBookingSlot, planBookingOffers, type BookingCheck } from '../_shared/slot-offers.ts'
import { normalizeCalendly, type CalendlySettings } from '../_shared/calendly-settings.ts'
import { buildAsks, collectAnswers, type Ask } from '../_shared/booking-fields.ts'
import { toE164 } from '../_shared/phone.ts'
import {
  isValidTimezone,
  momentLabel,
  nowLabel,
  recordSentOffers,
  timezoneLabel,
  type OfferStep,
  type StoredOffers,
} from '../_shared/agenda-slots.ts'
import {
  CalendlyError,
  availableTimes,
  createInvitee,
  findCalendlyAccount,
  getCalendlyAccessToken,
  getEventType,
  joinUrlOf,
  type CalendlyAccount,
} from '../_shared/calendly.ts'
import type { EventTypeInfo } from '../_shared/calendly-event-type.ts'
import { notifyAccount, notifyNeedsYou } from '../_shared/notify.ts'
import type { RunTool, ToolDefinition, ToolOutcome } from '../_shared/tool-loop.ts'
import { calendlyTools, type AgendaPromptContext } from './agenda-prompt.ts'
import { meetLinkSent } from './agenda.ts'

const HORIZON_MS = 30 * 86_400_000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type CalendlyBooking = { id: string; event_start_at: string; meet_link: string | null }
export type CalendlyFailure = 'calendly_token_expired' | 'calendly_plan_required' | 'calendly_unavailable'

export const CALENDLY_FAILURE_MESSAGES: Record<CalendlyFailure, string> = {
  calendly_token_expired: 'Reconnectez Calendly : l’assistant n’a pas pu fixer l’appel avec ce prospect.',
  calendly_plan_required: 'Forfait Calendly trop limité : l’assistant n’a pas pu réserver l’appel lui-même.',
  calendly_unavailable: 'Calendly ne répond pas : l’assistant n’a pas pu fixer l’appel, reprenez la main.',
}

export type CalendlyTurn = {
  stopReason: 'calendly_booked'
  timezone: string
  prompt: AgendaPromptContext
  tools: ToolDefinition[]
  runTool: RunTool
  storedOffers: StoredOffers | null
  step: OfferStep | null
  recordSent: (texts: string[]) => StoredOffers | null
  result: { booking: CalendlyBooking | null; bookedThisTurn: boolean; failure: CalendlyFailure | null }
}

const BOOKING_FALLBACK =
  'Calendly est inaccessible : dis au prospect que tu reviens vers lui très vite pour fixer l’appel, sans rien confirmer.'
const CHECK_FALLBACK =
  'Les disponibilités ne peuvent pas être lues pour le moment : ne confirme aucune heure, continue l’échange et propose d’y revenir.'

export async function calendlyBookingEnabled(userId: string, settings: Record<string, any>) {
  if (settings.booking?.mode !== 'calendly') return false
  if (!normalizeCalendly(settings.booking?.calendly).event_type_uri) return false
  const { data } = await admin.rpc('user_has_feature', { p_user: userId, p_key: 'calendly_booking' })
  return data === true
}

export async function activeCalendlyBooking(convId: number): Promise<CalendlyBooking | null> {
  const { data } = await admin
    .from('bookings')
    .select('id, event_start_at, meet_link')
    .eq('conversation_id', convId)
    .eq('provider', 'calendly')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  return data ?? null
}

function describeCheck(check: BookingCheck) {
  if (check.ok) return `Libre : ${check.label}.`
  const alts = check.alternatives.map((a) => `${a.label} (${a.debut})`).join(', ')
  if (check.reason === 'format') {
    return 'Heure illisible : utilise le format AAAA-MM-JJTHH:MM.'
  }
  const why = check.reason === 'nonexistent' ? 'cette heure n’existe pas ce jour-là (changement d’heure)' : 'ce moment n’est pas réservable'
  return `Indisponible : ${why}. Moments libres proches : ${alts || 'aucun dans les prochaines semaines'}.`
}

// Le nom vient du profil Instagram du prospect : il finit dans l'invitation envoyée par Calendly.
function safeName(name: string) {
  return name.replace(/https?:\/\/\S+|www\.\S+/gi, '').replace(/\s+/g, ' ').trim().slice(0, 60)
}

function venueOf(info: EventTypeInfo | null, booking: CalendlyBooking | null) {
  if (info) {
    if (info.isVideo) return { venue: 'video' as const, venueText: undefined }
    if (info.location?.location) return { venue: 'place' as const, venueText: info.location.location }
    return { venue: 'none' as const, venueText: undefined }
  }
  return { venue: booking?.meet_link ? ('video' as const) : ('none' as const), venueText: undefined }
}

async function warnAccount(userId: string, e: unknown) {
  if (!(e instanceof CalendlyError)) return
  if (e.code === 'token_expired') await notifyAccount(userId, 'code:calendly', 'Calendly à reconnecter')
  else if (e.code === 'plan_required') await notifyAccount(userId, 'code:calendly', 'Forfait Calendly trop limité pour réserver')
}

// Le numéro donné pendant la conversation vaut pour toute la fiche, pas seulement pour l'appel.
async function saveContactPhone(convId: number, phone: string) {
  const { data } = await admin.from('conversations').select('contact_id').eq('id', convId).maybeSingle()
  const contactId = (data as { contact_id: string | null } | null)?.contact_id
  if (!contactId) return
  await admin.from('contacts').update({ phone_e164: phone }).eq('id', contactId).is('phone_e164', null)
}

export async function prepareCalendlyTurn(opts: {
  userId: string
  convId: number
  tz: string
  settings: Record<string, any>
  metadata: Record<string, unknown>
  contactName: string
  contactHandle: string | null
}): Promise<{ ok: true; turn: CalendlyTurn } | { ok: false; link: string }> {
  const { userId, convId } = opts
  const tz = isValidTimezone(opts.tz) ? opts.tz : 'Europe/Paris'
  if (tz !== opts.tz) {
    await logEvent('warn', 'assistant-dispatch', `fuseau invalide « ${opts.tz} », Europe/Paris utilisé`, { user_id: userId })
  }
  const stored = normalizeCalendly(opts.settings.booking?.calendly)
  const now = Date.now()
  const booking = await activeCalendlyBooking(convId)
  const account = await findCalendlyAccount(userId)

  let token: string | null = null
  let info: EventTypeInfo | null = null
  let slots: number[] = []
  let reachable = false
  if (account) {
    try {
      token = await getCalendlyAccessToken(account)
      info = await getEventType(account, token, stored.event_type_uri)
      if (info.bookable) {
        slots = await availableTimes(account, token, stored.event_type_uri, now, now + HORIZON_MS)
        reachable = true
      } else {
        await logEvent('warn', 'assistant-dispatch', `page Calendly non réservable conv=${convId}: ${info.blockers.join(' ; ')}`, {
          user_id: userId,
          conversation_id: convId,
        })
      }
    } catch (e) {
      await logEvent('warn', 'assistant-dispatch', `Calendly illisible conv=${convId}: ${String(e).slice(0, 200)}`, {
        user_id: userId,
        conversation_id: convId,
      })
      await warnAccount(userId, e)
    }
  }

  // Sans rendez-vous pris, une panne fait simplement revenir à l'envoi du lien.
  if (!reachable && !booking) return { ok: false, link: info?.schedulingUrl || stored.scheduling_url }

  const settings: CalendlySettings = { ...stored, duration_min: info?.durationMin ?? stored.duration_min }
  const asks: Ask[] = buildAsks(stored.extra_fields, info?.questions ?? [])
  const planned = reachable
    ? planBookingOffers({
        now,
        tz,
        settings,
        page: stored.event_type_uri,
        slots,
        stored: opts.metadata.agenda_offers as Partial<StoredOffers> | undefined,
      })
    : null
  const step = planned?.step ?? null

  let booked: AgendaPromptContext['booked'] = null
  if (booking) {
    const link = booking.meet_link
    booked = {
      label: momentLabel(Date.parse(booking.event_start_at), tz),
      confirmed: link ? await meetLinkSent(convId, link) : false,
    }
  }

  const result: CalendlyTurn['result'] = { booking, bookedThisTurn: false, failure: null }

  function bookingFailed(e: unknown): ToolOutcome {
    if (e instanceof CalendlyError && e.code === 'token_expired') result.failure = 'calendly_token_expired'
    else if (e instanceof CalendlyError && e.code === 'plan_required') result.failure = 'calendly_plan_required'
    else result.failure = 'calendly_unavailable'
    return { content: BOOKING_FALLBACK, isError: true }
  }

  async function freshSlots() {
    return await availableTimes(account!, token!, stored.event_type_uri, Date.now(), Date.now() + HORIZON_MS)
  }

  async function verify(debut: string): Promise<ToolOutcome> {
    if (!reachable) return { content: CHECK_FALLBACK, isError: true }
    return { content: describeCheck(checkBookingSlot({
        value: debut,
        slots,
        durationMin: settings.duration_min,
        tz,
        now: Date.now(),
        noticeHours: settings.notice_hours,
      })) }
  }

  async function insertBooking(row: Record<string, unknown>, eventUri: string) {
    const inserted = await admin.from('bookings').insert(row).select('id, event_start_at, meet_link').single()
    if (inserted.data) return inserted.data as CalendlyBooking
    // Le webhook Calendly reçoit la même réservation : l'index unique sur event_uri tranche.
    const { data } = await admin
      .from('bookings')
      .select('id, event_start_at, meet_link')
      .eq('event_uri', eventUri)
      .maybeSingle()
    if (!data) {
      await logEvent('error', 'assistant-dispatch', `réservation Calendly non enregistrée conv=${convId} event=${eventUri}: ${inserted.error?.message}`, {
        user_id: userId,
        conversation_id: convId,
      })
    }
    return (data as CalendlyBooking | null) ?? null
  }

  async function reserve(debut: string, email: string, infos: unknown): Promise<ToolOutcome> {
    if (result.booking) {
      return {
        content: `Déjà réservé : ${momentLabel(Date.parse(result.booking.event_start_at), tz)}. Confirme-le au prospect sans rien proposer d’autre.`,
      }
    }
    if (!EMAIL_RE.test(email)) {
      return { content: 'E-mail invalide : redemande-le, la réservation ne peut pas se faire sans lui.', isError: true }
    }
    if (!reachable || !account || !token || !info) return bookingFailed(new CalendlyError('unavailable', 'Calendly illisible'))

    const collected = collectAnswers(asks, infos)
    if (collected.missing.length > 0) {
      return {
        content: `Il manque ${collected.missing.join(' et ')} : la page de réservation l’exige. Demande-le, puis rappelle reserver_appel.`,
        isError: true,
      }
    }

    const who = safeName(opts.contactName) || (opts.contactHandle ? `@${opts.contactHandle}` : 'Prospect Instagram')
    // Relecture fraîche : le créneau a pu partir depuis le début du tour.
    let check: BookingCheck
    try {
      check = checkBookingSlot({
        value: debut,
        slots: await freshSlots(),
        durationMin: settings.duration_min,
        tz,
        now: Date.now(),
        noticeHours: settings.notice_hours,
      })
    } catch (e) {
      await warnAccount(userId, e)
      return bookingFailed(e)
    }
    if (!check.ok) return { content: describeCheck(check) }

    let created: Awaited<ReturnType<typeof createInvitee>>
    try {
      created = await createInvitee({
        account,
        token,
        eventTypeUri: stored.event_type_uri,
        start: check.start,
        name: who,
        email,
        timezone: tz,
        location: info.location,
        answers: collected.answers.map((a) =>
          asks.some((k) => k.kind === 'phone' && k.position === a.position) ? { ...a, answer: toE164(a.answer, tz) ?? a.answer } : a,
        ),
        conversationId: convId,
      })
    } catch (e) {
      // Créneau parti entre la relecture et la réservation : ce n'est pas une panne, l'agent
      // en propose un autre. Le motif du refus se lit dans l'agenda, pas dans le texte d'erreur.
      if (e instanceof CalendlyError && e.code === 'bad_request') {
        const again = await freshSlots().catch(() => null)
        if (again && !again.includes(check.start)) {
          return { content: 'Ce moment vient d’être pris : propose-lui une autre heure.' }
        }
      }
      await logEvent('error', 'assistant-dispatch', `réservation Calendly impossible conv=${convId}: ${String(e).slice(0, 300)}`, {
        user_id: userId,
        conversation_id: convId,
      })
      await warnAccount(userId, e)
      return bookingFailed(e)
    }

    // Le rendez-vous existe désormais chez Calendly : plus rien ici ne doit annoncer un échec.
    const eventUri = created.eventUri
    const join = info.isVideo ? await joinUrlOf(account, token, eventUri) : null

    const saved = await insertBooking(
      {
        user_id: userId,
        conversation_id: convId,
        provider: 'calendly',
        event_type_uri: stored.event_type_uri,
        event_type_name: info.name,
        invitee_email: email,
        invitee_name: who,
        event_uri: eventUri,
        event_start_at: new Date(check.start).toISOString(),
        event_end_at: new Date(check.end).toISOString(),
        meet_link: join,
        status: 'active',
        raw_payload: {
          invitee_uri: created.inviteeUri,
          account_id: account.id,
          source: 'assistant',
          answers: collected.saved,
        },
      },
      eventUri,
    )

    // Le rendez-vous existe chez Calendly même si la ligne n'a pas pu être écrite : on confirme.
    result.booking = saved ?? { id: '', event_start_at: new Date(check.start).toISOString(), meet_link: join }
    result.bookedThisTurn = true
    const phoneNumber = toE164(collected.phone, tz)
    if (phoneNumber) await saveContactPhone(convId, phoneNumber)
    if (info.isVideo && !join) {
      await notifyNeedsYou(userId, convId, 'Appel réservé sans lien de visio : envoyez-le au prospect.', { renew: true })
    }
    const where = join ? 'Le lien de la visio part aussi en message.' : 'Les détails sont dans l’invitation.'
    return { content: `Réservé : ${check.label}. Invitation envoyée à ${email}. ${where}` }
  }

  const runTool: RunTool = async (name, input) => {
    const debut = typeof input.debut === 'string' ? input.debut : ''
    if (name === 'verifier_creneau') return await verify(debut)
    if (name === 'reserver_appel') {
      return await reserve(debut, typeof input.email === 'string' ? input.email.trim() : '', input.infos)
    }
    return { content: 'Outil inconnu.', isError: true }
  }

  const { venue, venueText } = venueOf(info, booking)
  return {
    ok: true,
    turn: {
      stopReason: 'calendly_booked',
      timezone: tz,
      prompt: {
        durationMin: settings.duration_min,
        now: nowLabel(now, tz),
        timezone: timezoneLabel(tz),
        step,
        booked,
        emailRequired: true,
        venue,
        venueText,
        offerStyle: settings.offer_style,
        asks: asks.map((a) => ({ key: a.key, label: a.label, kind: a.kind })),
      },
      tools: calendlyTools(asks.map((a) => ({ key: a.key, label: a.label, kind: a.kind }))),
      runTool,
      storedOffers: planned?.stored ?? null,
      step,
      recordSent: (texts) =>
        planned ? recordSentOffers(planned.stored, step, texts, tz, settings.offer_style === 'slot') : null,
      result,
    },
  }
}
