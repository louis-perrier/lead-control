// Plages proposées à partir des créneaux réservables renvoyés par Calendly.
// Calendly applique déjà ses jours, ses heures, son délai minimum, son horizon et ses temps
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
import { type CalendlySettings } from './calendly-settings.ts'

const MINUTE = 60_000

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

export function offerStillBookable(o: Offer, slots: number[], durationMin: number) {
  const last = o.end - durationMin * MINUTE
  return slots.filter((s) => s >= o.start && s <= last).length >= 2
}

export function computeCalendlyOffers(opts: {
  now: number
  tz: string
  settings: CalendlySettings
  slots: number[]
  count: number
  keep?: Offer[]
  withDate?: boolean
}): Offer[] {
  const { now, tz, settings: s, slots, count } = opts
  const durationMs = s.duration_min * MINUTE
  const kept = (opts.keep ?? []).filter((o) => o.start > now && offerStillBookable(o, slots, s.duration_min))
  if (kept.length >= count) return kept.slice(0, count)

  const todayNumber = dayNumber(now, tz)
  const keptDays = new Set(kept.map((o) => dayNumber(o.start, tz)))
  const byDay = new Map<number, Candidate[]>()
  for (const run of runsOf(slots, s.duration_min)) {
    for (const c of runCandidates(run, s.range_hours * 3_600_000, durationMs, tz, todayNumber)) {
      if (keptDays.has(todayNumber + c.dayIndex)) continue
      const list = byDay.get(c.dayIndex)
      if (list) list.push(c)
      else byDay.set(c.dayIndex, [c])
    }
  }

  const perDay = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([, list]) => list)
  const fresh = chooseOffers(perDay, count, kept.length).map((c) => ({
    start: c.start,
    end: c.end,
    label: rangeLabel(c.start, c.end, tz, opts.withDate ?? true),
  }))
  return [...kept, ...fresh].slice(0, count)
}

// Clé des plages mémorisées : changer de page de réservation ou de réglage les recalcule.
export function calendlyOffersKey(s: CalendlySettings, tz: string) {
  return JSON.stringify([tz, s.event_type_uri, s.duration_min, s.range_hours, s.first_offer, s.extra_offers])
}

export function planCalendlyOffers(opts: {
  now: number
  tz: string
  settings: CalendlySettings
  slots: number[]
  stored: Partial<StoredOffers> | null | undefined
}): { stored: StoredOffers; step: OfferStep } {
  const { settings: s, tz, slots } = opts
  const base = storedBase(calendlyOffersKey(s, tz), opts.stored)
  const keep = keepOrder(base)
  const sentStillFree = keep.filter(
    (o) => base.sent.includes(o.start) && o.start > opts.now && offerStillBookable(o, slots, s.duration_min),
  ).length
  const offers = computeCalendlyOffers({
    now: opts.now,
    tz,
    settings: s,
    slots,
    keep,
    count: sentStillFree + unsentNeeded(s.first_offer, s.extra_offers, base.rounds),
  })
  return planFromOffers(base, offers, { firstOffer: s.first_offer, extraOffers: s.extra_offers })
}

export type CalendlyRefusal = 'format' | 'nonexistent' | 'unavailable'

export type CalendlyCheck =
  | { ok: true; start: number; end: number; label: string }
  | { ok: false; reason: CalendlyRefusal; alternatives: { debut: string; label: string }[] }

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

export function checkCalendlySlot(opts: {
  value: string
  slots: number[]
  durationMin: number
  tz: string
}): CalendlyCheck {
  const { slots, tz } = opts
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
