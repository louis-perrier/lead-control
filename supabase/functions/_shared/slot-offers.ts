// Propositions bâties sur une liste de créneaux réservables fournie par l'outil de réservation.
// L'outil applique déjà ses jours, ses heures, son délai minimum, son horizon et ses temps
// tampon : on ne recalcule aucune disponibilité, on regroupe seulement ses créneaux.
import {
  chooseOffers,
  keepOrder,
  localIso,
  momentLabel,
  parseLocalIso,
  periodOf,
  planFromOffers,
  rangeLabel,
  storedBase,
  unsentNeeded,
  zonedParts,
  zonedToUtc,
  type Candidate,
  type Offer,
  type OfferStep,
  type StoredOffers,
} from './agenda-slots.ts'

const MINUTE = 60_000

// Ce dont le calcul a besoin, sans rien savoir du fournisseur qui a produit les créneaux.
export type OfferSettings = {
  duration_min: number
  range_hours: number
  first_offer: number
  extra_offers: number
  offer_style: 'range' | 'slot'
  notice_hours: number
}

// L'outil applique son propre délai minimum. Celui du client s'y ajoute et ne peut que
// l'allonger : un créneau trop proche disparaît avant tout calcul, donc il n'est ni proposé,
// ni accepté si le prospect le demande de lui-même.
export function bookableSlots(slots: number[], now: number, hours: number) {
  if (!hours) return slots
  const floor = now + hours * 3_600_000
  return slots.filter((s) => s >= floor)
}

// Deux créneaux précis d'une même journée se ressemblent s'ils se touchent : on les écarte.
const SPREAD_MS = 2 * 3_600_000

export type Run = { start: number; end: number; slots: number[] }

// Une suite de créneaux sans trou plus grand que la durée de l'appel : entre son début et sa
// fin, le prospect trouve toujours une heure réservable.
export function runsOf(slots: number[], durationMin: number): Run[] {
  const gap = durationMin * MINUTE
  const out: Run[] = []
  for (const s of [...slots].sort((a, b) => a - b)) {
    const last = out[out.length - 1]
    const previous = last?.slots[last.slots.length - 1]
    if (last && previous !== undefined && s - previous <= gap) {
      last.slots.push(s)
      last.end = s + gap
    } else {
      out.push({ start: s, end: s + gap, slots: [s] })
    }
  }
  return out
}

function dayNumber(ms: number, tz: string) {
  const p = zonedParts(ms, tz)
  return Math.floor(Date.UTC(p.year, p.month - 1, p.day) / 86_400_000)
}

// Une plage part d'un créneau réservable posé sur l'heure pleine, ou du début de la suite,
// et doit contenir au moins deux créneaux pour que le choix ait un sens.
function runCandidates(run: Run, rangeMs: number, durationMs: number, tz: string, todayNumber: number): Candidate[] {
  const out: Candidate[] = []
  for (const start of run.slots) {
    const p = zonedParts(start, tz)
    if (p.minute !== 0 && start !== run.start) continue
    const end = Math.min(start + rangeMs, run.end)
    const last = end - durationMs
    if (run.slots.filter((s) => s >= start && s <= last).length < 2) continue
    out.push({ start, end, period: periodOf(p.hour * 60 + p.minute), dayIndex: dayNumber(start, tz) - todayNumber })
  }
  return out
}

// Un créneau précis tient tant qu'il est réservable ; une plage, tant qu'elle laisse le choix.
export function offerStillBookable(o: Offer, slots: number[], durationMin: number, style: 'range' | 'slot' = 'range') {
  if (style === 'slot') return slots.includes(o.start)
  const last = o.end - durationMin * MINUTE
  return slots.filter((s) => s >= o.start && s <= last).length >= 2
}

function slotCandidates(slots: number[], durationMs: number, tz: string, todayNumber: number): Candidate[] {
  return [...slots]
    .sort((a, b) => a - b)
    .map((start) => {
      const p = zonedParts(start, tz)
      return {
        start,
        end: start + durationMs,
        period: periodOf(p.hour * 60 + p.minute),
        dayIndex: dayNumber(start, tz) - todayNumber,
      }
    })
}

// Deux créneaux du même jour doivent tomber sur deux moments différents : 9 h et 11 h se
// ressemblent, matin et après-midi laissent un vrai choix. Une journée qui n'offre qu'un seul
// moment ne sert donc pas deux créneaux, on repart sur deux jours.
function spaceOut(day: Candidate[], count: number, minGap: number): Candidate[] {
  const out: Candidate[] = []
  for (const c of day) {
    const last = out[out.length - 1]
    if (last && c.start - last.start < minGap) continue
    if (out.some((o) => o.period === c.period)) continue
    out.push(c)
    if (out.length >= count) break
  }
  return out
}

// Les créneaux d'une même proposition tombent le même jour dès qu'une journée en offre assez,
// sinon un par jour comme pour les plages. Ceux que l'on garde pour un refus viennent d'autres
// jours : le prospect qui écarte une journée ne se voit pas reproposer la même.
export function chooseSlotOffers(
  perDay: Candidate[][],
  count: number,
  offset: number,
  durationMs: number,
  groupSize: number,
): Candidate[] {
  const wanted = count - offset
  const group = Math.min(groupSize, wanted)
  if (group > 1) {
    const minGap = Math.max(SPREAD_MS, durationMs)
    for (let i = 0; i < perDay.length; i++) {
      const sameDay = spaceOut(perDay[i], group, minGap)
      if (sameDay.length < group) continue
      const rest = wanted - group
      if (rest === 0) return sameDay
      return [...sameDay, ...chooseOffers(perDay.filter((_, k) => k !== i), rest, 0)]
    }
  }
  return chooseOffers(perDay, count, offset)
}

export function computeBookingOffers(opts: {
  now: number
  tz: string
  settings: OfferSettings
  slots: number[]
  count: number
  keep?: Offer[]
  withDate?: boolean
}): Offer[] {
  const { now, tz, settings: s, count } = opts
  const slots = bookableSlots(opts.slots, now, s.notice_hours)
  const durationMs = s.duration_min * MINUTE
  const exact = s.offer_style === 'slot'
  const kept = (opts.keep ?? []).filter((o) => o.start > now && offerStillBookable(o, slots, s.duration_min, s.offer_style))
  if (kept.length >= count) return kept.slice(0, count)

  const todayNumber = dayNumber(now, tz)
  const keptDays = new Set(kept.map((o) => dayNumber(o.start, tz)))
  const all = exact
    ? slotCandidates(slots, durationMs, tz, todayNumber)
    : runsOf(slots, s.duration_min).flatMap((run) =>
        runCandidates(run, s.range_hours * 3_600_000, durationMs, tz, todayNumber),
      )
  const byDay = new Map<number, Candidate[]>()
  for (const c of all) {
    if (keptDays.has(todayNumber + c.dayIndex)) continue
    const list = byDay.get(c.dayIndex)
    if (list) list.push(c)
    else byDay.set(c.dayIndex, [c])
  }

  const perDay = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([, list]) => list)
  const picked = exact
    ? chooseSlotOffers(perDay, count, kept.length, durationMs, s.first_offer)
    : chooseOffers(perDay, count, kept.length)
  const fresh = picked.map((c) => ({
    start: c.start,
    end: c.end,
    label: exact ? momentLabel(c.start, tz) : rangeLabel(c.start, c.end, tz, opts.withDate ?? true),
  }))
  return [...kept, ...fresh].slice(0, count)
}

// Clé des plages mémorisées : changer de page de réservation ou de réglage les recalcule.
export function bookingOffersKey(s: OfferSettings, tz: string, page: string) {
  return JSON.stringify([
    tz,
    page,
    s.duration_min,
    s.range_hours,
    s.first_offer,
    s.extra_offers,
    s.offer_style,
    s.notice_hours,
  ])
}

export function planBookingOffers(opts: {
  now: number
  tz: string
  settings: OfferSettings
  page: string
  slots: number[]
  stored: Partial<StoredOffers> | null | undefined
}): { stored: StoredOffers; step: OfferStep } {
  const { settings: s, tz } = opts
  const slots = bookableSlots(opts.slots, opts.now, s.notice_hours)
  const base = storedBase(bookingOffersKey(s, tz, opts.page), opts.stored)
  const keep = keepOrder(base)
  const sentStillFree = keep.filter(
    (o) => base.sent.includes(o.start) && o.start > opts.now && offerStillBookable(o, slots, s.duration_min, s.offer_style),
  ).length
  const offers = computeBookingOffers({
    now: opts.now,
    tz,
    settings: s,
    slots,
    keep,
    count: sentStillFree + unsentNeeded(s.first_offer, s.extra_offers, base.rounds),
  })
  return planFromOffers(base, offers, { firstOffer: s.first_offer, extraOffers: s.extra_offers })
}

export type BookingRefusal = 'format' | 'nonexistent' | 'unavailable'

export type BookingCheck =
  | { ok: true; start: number; end: number; label: string }
  | { ok: false; reason: BookingRefusal; alternatives: { debut: string; label: string }[] }

// Deux propositions de repli, assez espacées pour ne pas se ressembler.
function nearbySlots(target: number, slots: number[], tz: string) {
  const sorted = [...slots].sort((a, b) => Math.abs(a - target) - Math.abs(b - target))
  const out: number[] = []
  for (const s of sorted) {
    if (out.length >= 2) break
    if (out.some((k) => Math.abs(k - s) < 90 * MINUTE)) continue
    out.push(s)
  }
  return out
    .sort((a, b) => a - b)
    .map((s) => ({ debut: localIso(s, tz), label: momentLabel(s, tz) }))
}

export function checkBookingSlot(opts: {
  value: string
  slots: number[]
  durationMin: number
  tz: string
  now: number
  noticeHours: number
}): BookingCheck {
  const { tz } = opts
  const slots = bookableSlots(opts.slots, opts.now, opts.noticeHours)
  const parsed = parseLocalIso(opts.value)
  if (!parsed) return { ok: false, reason: 'format', alternatives: [] }
  const start = zonedToUtc(parsed.year, parsed.month, parsed.day, parsed.minutes, tz)
  if (start == null) {
    const approx = Date.UTC(parsed.year, parsed.month - 1, parsed.day, Math.floor(parsed.minutes / 60), parsed.minutes % 60)
    return { ok: false, reason: 'nonexistent', alternatives: nearbySlots(approx, slots, tz) }
  }
  if (!slots.includes(start)) return { ok: false, reason: 'unavailable', alternatives: nearbySlots(start, slots, tz) }
  return { ok: true, start, end: start + opts.durationMin * MINUTE, label: momentLabel(start, tz) }
}
