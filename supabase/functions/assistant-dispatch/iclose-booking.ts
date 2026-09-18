// Mode iClose : mêmes outils et mêmes messages que le mode Calendly, source de créneaux
// différente. Une panne côté iClose ne met jamais la conversation en erreur tant qu'aucun
// rendez-vous n'est pris : l'assistant retombe sur l'envoi du lien de réservation.
import { admin, logEvent } from '../_shared/core.ts'
import { checkBookingSlot, planBookingOffers, type BookingCheck } from '../_shared/slot-offers.ts'
import { normalizeIclose, type IcloseSettings } from '../_shared/iclose-settings.ts'
import { buildAsks, collectAnswers, type Ask } from '../_shared/booking-fields.ts'
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
  IcloseError,
  availableTimes,
  createEventCall,
  findIcloseAccount,
  getEvent,
  getIcloseKey,
  sendInviteeAnswers,
  upsertContact,
  type IcloseAccount,
} from '../_shared/iclose.ts'
import type { IcloseEvent } from '../_shared/iclose-event.ts'
import { notifyAccount, notifyNeedsYou } from '../_shared/notify.ts'
import type { RunTool, ToolDefinition, ToolOutcome } from '../_shared/tool-loop.ts'
import { calendlyTools, type AgendaPromptContext } from './agenda-prompt.ts'
import { meetLinkSent } from './agenda.ts'

const HORIZON_MS = 30 * 86_400_000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type IcloseBooking = { id: string; event_start_at: string; meet_link: string | null }
export type IcloseFailure = 'iclose_token_invalid' | 'iclose_plan_required' | 'iclose_unavailable'

export const ICLOSE_FAILURE_MESSAGES: Record<IcloseFailure, string> = {
  iclose_token_invalid: 'Clé iClose refusée : l’assistant n’a pas pu fixer l’appel avec ce prospect.',
  iclose_plan_required: 'Forfait iClose trop limité : l’assistant n’a pas pu réserver l’appel lui-même.',
  iclose_unavailable: 'iClose ne répond pas : l’assistant n’a pas pu fixer l’appel, reprenez la main.',
}

export type IcloseTurn = {
  stopReason: 'iclose_booked'
  timezone: string
  prompt: AgendaPromptContext
  tools: ToolDefinition[]
  runTool: RunTool
  storedOffers: StoredOffers | null
  step: OfferStep | null
  recordSent: (texts: string[]) => StoredOffers | null
  result: { booking: IcloseBooking | null; bookedThisTurn: boolean; failure: IcloseFailure | null }
}

const BOOKING_FALLBACK =
  'iClose est inaccessible : dis au prospect que tu reviens vers lui très vite pour fixer l’appel, sans rien confirmer.'
const CHECK_FALLBACK =
  'Les disponibilités ne peuvent pas être lues pour le moment : ne confirme aucune heure, continue l’échange et propose d’y revenir.'

export async function icloseBookingEnabled(userId: string, settings: Record<string, any>) {
  if (settings.booking?.mode !== 'iclose') return false
  if (!normalizeIclose(settings.booking?.iclose).link_prefix) return false
  const { data } = await admin.rpc('user_has_feature', { p_user: userId, p_key: 'iclose_booking' })
  return data === true
}

export async function activeIcloseBooking(convId: number): Promise<IcloseBooking | null> {
  const { data } = await admin
    .from('bookings')
    .select('id, event_start_at, meet_link')
    .eq('conversation_id', convId)
    .eq('provider', 'iclose')
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

// Le nom vient du profil Instagram du prospect : il finit dans la fiche iClose.
function safeName(name: string) {
  return name.replace(/https?:\/\/\S+|www\.\S+/gi, '').replace(/\s+/g, ' ').trim().slice(0, 60)
}

function splitName(full: string) {
  const parts = full.split(' ').filter(Boolean)
  if (parts.length === 0) return { firstName: 'Prospect', lastName: 'Instagram' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') || 'Instagram' }
}

async function warnAccount(userId: string, e: unknown) {
  if (!(e instanceof IcloseError)) return
  if (e.code === 'token_invalid') await notifyAccount(userId, 'code:iclose', 'Clé iClose à refaire')
  else if (e.code === 'plan_required') await notifyAccount(userId, 'code:iclose', 'Forfait iClose trop limité pour réserver')
}

async function saveContactPhone(convId: number, phone: string) {
  const { data } = await admin.from('conversations').select('contact_id').eq('id', convId).maybeSingle()
  const contactId = (data as { contact_id: string | null } | null)?.contact_id
  if (!contactId) return
  await admin.from('contacts').update({ phone_e164: phone }).eq('id', contactId).is('phone_e164', null)
}

export async function prepareIcloseTurn(opts: {
  userId: string
  convId: number
  tz: string
  settings: Record<string, any>
  metadata: Record<string, unknown>
  contactName: string
  contactHandle: string | null
}): Promise<{ ok: true; turn: IcloseTurn } | { ok: false; link: string }> {
  const { userId, convId } = opts
  const tz = isValidTimezone(opts.tz) ? opts.tz : 'Europe/Paris'
  const stored = normalizeIclose(opts.settings.booking?.iclose)
  const now = Date.now()
  const booking = await activeIcloseBooking(convId)
  const account = await findIcloseAccount(userId)

  let key: string | null = null
  let event: IcloseEvent | null = null
  let slots: number[] = []
  let reachable = false
  if (account) {
    try {
      key = await getIcloseKey(account)
      event = await getEvent(key, stored.event_id || stored.link_prefix, account)
      if (event?.bookable) {
        slots = await availableTimes(key, event.linkPrefix, tz, now, now + HORIZON_MS, account)
        reachable = true
      } else {
        await logEvent('warn', 'assistant-dispatch', `page iClose non réservable conv=${convId}: ${event?.blockers.join(' ; ') ?? 'page introuvable'}`, {
          user_id: userId,
          conversation_id: convId,
        })
      }
    } catch (e) {
      await logEvent('warn', 'assistant-dispatch', `iClose illisible conv=${convId}: ${String(e).slice(0, 200)}`, {
        user_id: userId,
        conversation_id: convId,
      })
      await warnAccount(userId, e)
    }
  }

  if (!reachable && !booking) return { ok: false, link: event?.bookingUrl || stored.booking_url }

  const settings: IcloseSettings = { ...stored, duration_min: event?.durationMin ?? stored.duration_min }
  const asks: Ask[] = buildAsks(stored.extra_fields, [])
  const planned = reachable
    ? planBookingOffers({
        now,
        tz,
        settings,
        page: stored.link_prefix,
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

  const result: IcloseTurn['result'] = { booking, bookedThisTurn: false, failure: null }

  function bookingFailed(e: unknown): ToolOutcome {
    if (e instanceof IcloseError && e.code === 'token_invalid') result.failure = 'iclose_token_invalid'
    else if (e instanceof IcloseError && e.code === 'plan_required') result.failure = 'iclose_plan_required'
    else result.failure = 'iclose_unavailable'
    return { content: BOOKING_FALLBACK, isError: true }
  }

  async function freshSlots() {
    return await availableTimes(key!, event!.linkPrefix, tz, Date.now(), Date.now() + HORIZON_MS, account!)
  }

  async function verify(debut: string): Promise<ToolOutcome> {
    if (!reachable) return { content: CHECK_FALLBACK, isError: true }
    return { content: describeCheck(checkBookingSlot({ value: debut, slots, durationMin: settings.duration_min, tz })) }
  }

  async function insertBooking(row: Record<string, unknown>, callId: string) {
    const inserted = await admin.from('bookings').insert(row).select('id, event_start_at, meet_link').single()
    if (inserted.data) return inserted.data as IcloseBooking
    // Le webhook iClose reçoit la même réservation : l'index unique sur l'identifiant tranche.
    const { data } = await admin
      .from('bookings')
      .select('id, event_start_at, meet_link')
      .eq('provider', 'iclose')
      .eq('external_event_id', callId)
      .maybeSingle()
    if (!data) {
      await logEvent('error', 'assistant-dispatch', `réservation iClose non enregistrée conv=${convId} call=${callId}: ${inserted.error?.message}`, {
        user_id: userId,
        conversation_id: convId,
      })
    }
    return (data as IcloseBooking | null) ?? null
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
    if (!reachable || !account || !key || !event) return bookingFailed(new IcloseError('unavailable', 'iClose illisible'))

    const collected = collectAnswers(asks, infos)
    if (collected.missing.length > 0) {
      return {
        content: `Il manque ${collected.missing.join(' et ')} : la page de réservation l’exige. Demande-le, puis rappelle reserver_appel.`,
        isError: true,
      }
    }

    const who = safeName(opts.contactName) || (opts.contactHandle ? `@${opts.contactHandle}` : 'Prospect Instagram')
    let check: BookingCheck
    try {
      check = checkBookingSlot({ value: debut, slots: await freshSlots(), durationMin: settings.duration_min, tz })
    } catch (e) {
      await warnAccount(userId, e)
      return bookingFailed(e)
    }
    if (!check.ok) return { content: describeCheck(check) }

    let created: Awaited<ReturnType<typeof createEventCall>>
    let contactId = ''
    try {
      const { firstName, lastName } = splitName(who)
      contactId = await upsertContact(
        key,
        { firstName, lastName, email, ...(collected.phone ? { phoneNumber: collected.phone } : {}) },
        account,
      )
      const answered = await sendInviteeAnswers(
        key,
        { contactId, eventId: event.id, email, name: who, answers: collected.answers },
        account,
      )
      // Le filtre de qualification du client a écarté ce prospect : rien à réserver.
      if (answered.disqualified) {
        await notifyNeedsYou(userId, convId, 'Prospect écarté par les règles de votre page iClose : aucun appel réservé.', {
          renew: true,
        })
        return {
          content: 'La réservation n’est pas possible pour ce prospect : dis-lui que tu reviens vers lui, sans confirmer d’heure.',
        }
      }
      created = await createEventCall(
        key,
        {
          eventId: event.id,
          linkPrefix: event.linkPrefix,
          contactId,
          start: check.start,
          timezone: tz,
          conditionalUsers: answered.conditionalUsers,
          conversationId: convId,
        },
        account,
      )
    } catch (e) {
      if (e instanceof IcloseError && e.code === 'bad_request') {
        const again = await freshSlots().catch(() => null)
        if (again && !again.includes(check.start)) {
          return { content: 'Ce moment vient d’être pris : propose-lui une autre heure.' }
        }
      }
      await logEvent('error', 'assistant-dispatch', `réservation iClose impossible conv=${convId}: ${String(e).slice(0, 300)}`, {
        user_id: userId,
        conversation_id: convId,
      })
      await warnAccount(userId, e)
      return bookingFailed(e)
    }

    const saved = await insertBooking(
      {
        user_id: userId,
        conversation_id: convId,
        provider: 'iclose',
        event_type_uri: event.linkPrefix,
        event_type_name: event.name,
        invitee_email: email,
        invitee_name: who,
        external_event_id: created.id,
        event_start_at: new Date(check.start).toISOString(),
        event_end_at: new Date(check.start + settings.duration_min * 60_000).toISOString(),
        meet_link: created.joinUrl,
        status: 'active',
        raw_payload: {
          call_id: created.id,
          contact_id: contactId,
          account_id: account.id,
          source: 'assistant',
          answers: collected.saved,
        },
      },
      created.id,
    )

    result.booking = saved ?? {
      id: '',
      event_start_at: new Date(check.start).toISOString(),
      meet_link: created.joinUrl,
    }
    result.bookedThisTurn = true
    if (collected.phone) await saveContactPhone(convId, collected.phone)
    if (!created.joinUrl) {
      await notifyNeedsYou(userId, convId, 'Appel réservé sans lien de visio : envoyez-le au prospect.', { renew: true })
    }
    const where = created.joinUrl ? 'Le lien de la visio part aussi en message.' : 'Les détails sont dans l’invitation.'
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

  return {
    ok: true,
    turn: {
      stopReason: 'iclose_booked',
      timezone: tz,
      prompt: {
        durationMin: settings.duration_min,
        now: nowLabel(now, tz),
        timezone: timezoneLabel(tz),
        step,
        booked,
        emailRequired: true,
        venue: booking?.meet_link || reachable ? 'video' : 'none',
        offerStyle: settings.offer_style,
        asks: asks.map((a) => ({ key: a.key, label: a.label })),
      },
      tools: calendlyTools(asks.map((a) => ({ key: a.key, label: a.label }))),
      runTool,
      storedOffers: planned?.stored ?? null,
      step,
      recordSent: (texts) =>
        planned ? recordSentOffers(planned.stored, step, texts, tz, settings.offer_style === 'slot') : null,
      result,
    },
  }
}
