// Aucun import : testé sous Vitest et importé par la page Assistant pour l'aperçu.
// Heures locales au fuseau du profil, instants en millisecondes UTC.

export type AgendaSettings = {
  duration_min: number
  range_hours: number
  first_offer: number
  extra_offers: number
  days: boolean[]
  start: string
  end: string
}

export const AGENDA_DEFAULTS: AgendaSettings = {
  duration_min: 30,
  range_hours: 3,
  first_offer: 2,
  extra_offers: 1,
  days: [true, true, true, true, true, false, false],
  start: '09:00',
  end: '19:00',
}

export const DURATION_OPTIONS = [15, 30, 45, 60, 90]
export const RANGE_OPTIONS = [1, 2, 3, 4]

const HORIZON_DAYS = 14
const MIN_NOTICE_MS = 2 * 60 * 60 * 1000
const STEP_MIN = 15

export type Interval = { start: number; end: number }
export type Offer = { start: number; end: number; label: string }

const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
const MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

export function normalizeAgenda(raw: Partial<AgendaSettings> | null | undefined): AgendaSettings {
  const s = { ...AGENDA_DEFAULTS, ...(raw ?? {}) }
  const days = Array.isArray(s.days) && s.days.length === 7 ? s.days.map(Boolean) : AGENDA_DEFAULTS.days
  return {
    duration_min: DURATION_OPTIONS.includes(s.duration_min) ? s.duration_min : AGENDA_DEFAULTS.duration_min,
    range_hours: RANGE_OPTIONS.includes(s.range_hours) ? s.range_hours : AGENDA_DEFAULTS.range_hours,
    first_offer: clampInt(s.first_offer, 0, 3),
    extra_offers: clampInt(s.extra_offers, 0, 2),
    days,
    start: /^\d{2}:\d{2}$/.test(s.start) ? s.start : AGENDA_DEFAULTS.start,
    end: /^\d{2}:\d{2}$/.test(s.end) ? s.end : AGENDA_DEFAULTS.end,
  }
}

function clampInt(value: unknown, min: number, max: number) {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min
}

export function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

// Erreurs de réglage affichées sous les listes, null si tout est cohérent.
export function agendaSettingsError(s: AgendaSettings) {
  const span = toMinutes(s.end) - toMinutes(s.start)
  if (span <= 0) return 'L’heure de fin doit suivre l’heure de début.'
  if (!s.days.some(Boolean)) return 'Choisissez au moins un jour.'
  if (s.range_hours * 60 < s.duration_min) return 'Une plage doit durer au moins le temps de l’appel.'
  if (s.first_offer > 0 && s.range_hours * 60 > span) return 'Une plage ne peut pas dépasser vos heures d’appel.'
  return null
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number }

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(tz: string) {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short',
    })
    formatters.set(tz, f)
  }
  return f
}

const SHORT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function zonedParts(ms: number, tz: string): Parts {
  const out: Record<string, string> = {}
  for (const p of formatter(tz).formatToParts(new Date(ms))) out[p.type] = p.value
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour),
    minute: Number(out.minute),
    weekday: SHORT_DAYS.indexOf(out.weekday),
  }
}

// null quand l'heure n'existe pas ce jour-là (passage à l'heure d'été).
export function zonedToUtc(year: number, month: number, day: number, minutes: number, tz: string): number | null {
  const wall = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60)
  let guess = wall
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(guess, tz)
    const seen = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
    if (seen === wall) return guess
    guess += wall - seen
  }
  return null
}

function dayOffset(parts: Parts, offset: number) {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + offset))
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: (d.getUTCDay() + 6) % 7,
  }
}

function hourLabel(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
}

function dayLabel(weekday: number, day: number, month: number, withDate: boolean) {
  if (!withDate) return WEEKDAYS[weekday]
  return `${WEEKDAYS[weekday]} ${day === 1 ? '1er' : day} ${MONTHS[month - 1]}`
}

export function rangeLabel(start: number, end: number, tz: string, withDate = true) {
  const a = zonedParts(start, tz)
  const b = zonedParts(end, tz)
  return `${dayLabel(a.weekday, a.day, a.month, withDate)} entre ${hourLabel(a.hour * 60 + a.minute)} et ${hourLabel(b.hour * 60 + b.minute)}`
}

export function momentLabel(start: number, tz: string) {
  const a = zonedParts(start, tz)
  return `${dayLabel(a.weekday, a.day, a.month, true)} à ${hourLabel(a.hour * 60 + a.minute)}`
}

export function nowLabel(now: number, tz: string) {
  const a = zonedParts(now, tz)
  return `${dayLabel(a.weekday, a.day, a.month, true)} ${a.year}, ${hourLabel(a.hour * 60 + a.minute)}`
}

export function timezoneLabel(tz: string) {
  const city = tz.split('/').pop()?.replace(/_/g, ' ')
  return city && city !== tz ? `heure de ${city}` : `fuseau ${tz}`
}

// Format attendu des outils : heure locale sans fuseau, « 2026-09-22T14:30 ».
export function localIso(ms: number, tz: string) {
  const p = zonedParts(ms, tz)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`
}

function overlaps(start: number, end: number, busy: Interval[]) {
  return busy.some((b) => b.start < end && b.end > start)
}

type Period = 'morning' | 'afternoon' | 'evening'

function periodOf(minutes: number): Period {
  if (minutes < 12 * 60) return 'morning'
  if (minutes < 17 * 60) return 'afternoon'
  return 'evening'
}

const PREFERRED: Period[] = ['afternoon', 'evening', 'morning']

type Candidate = { start: number; end: number; period: Period; dayIndex: number }

function dayCandidates(
  dayIndex: number,
  date: { year: number; month: number; day: number },
  s: AgendaSettings,
  tz: string,
  busy: Interval[],
  notBefore: number,
): Candidate[] {
  const open = toMinutes(s.start)
  const close = toMinutes(s.end)
  const width = Math.min(s.range_hours * 60, close - open)
  if (width < s.duration_min) return []
  const starts = [open]
  for (let m = Math.ceil((open + 1) / 60) * 60; m + width <= close; m += 60) starts.push(m)
  const out: Candidate[] = []
  for (const m of starts) {
    if (m + width > close) continue
    const start = zonedToUtc(date.year, date.month, date.day, m, tz)
    const end = zonedToUtc(date.year, date.month, date.day, m + width, tz)
    if (start == null || end == null || start < notBefore) continue
    if (overlaps(start, end, busy)) continue
    out.push({ start, end, period: periodOf(m), dayIndex })
  }
  return out
}

function pick(cands: Candidate[], preferred: Period, avoid: Period | null) {
  const order = [preferred, ...PREFERRED.filter((p) => p !== preferred)]
  const ranked = avoid ? [...order.filter((p) => p !== avoid), avoid] : order
  for (const period of ranked) {
    const found = cands.find((c) => c.period === period)
    if (found) return found
  }
  return null
}

export function offerCount(s: AgendaSettings) {
  return s.first_offer > 0 ? s.first_offer + s.extra_offers : 0
}

// Plages entièrement libres, une par jour, à partir du lendemain : deux jours d'écart
// entre deux plages quand c'est possible, et une autre partie de journée que la précédente.
export function computeOffers(opts: {
  now: number
  tz: string
  settings: AgendaSettings
  busy: Interval[]
  count?: number
  keep?: Offer[]
  withDate?: boolean
}): Offer[] {
  const { now, tz, settings: s, busy } = opts
  const count = opts.count ?? offerCount(s)
  const today = zonedParts(now, tz)
  const notBefore = now + MIN_NOTICE_MS
  const kept = (opts.keep ?? []).filter((o) => o.start >= notBefore && !overlaps(o.start, o.end, busy))
  if (kept.length >= count) return kept.slice(0, count)

  const keptDays = new Set(kept.map((o) => dayKey(o.start, tz)))
  const perDay: Candidate[][] = []
  for (let i = 1; i <= HORIZON_DAYS; i++) {
    const date = dayOffset(today, i)
    const cands =
      s.days[date.weekday] && !keptDays.has(`${date.year}-${date.month}-${date.day}`)
        ? dayCandidates(i, date, s, tz, busy, notBefore)
        : []
    perDay.push(cands)
  }

  const chosen: Candidate[] = []
  const usedDays = new Set<number>()
  for (const gap of [2, 1]) {
    for (const cands of perDay) {
      if (kept.length + chosen.length >= count) break
      if (cands.length === 0 || usedDays.has(cands[0].dayIndex)) continue
      const last = chosen[chosen.length - 1]
      if (gap === 2 && last && cands[0].dayIndex - last.dayIndex < 2) continue
      const found = pick(cands, PREFERRED[(kept.length + chosen.length) % PREFERRED.length], last?.period ?? null)
      if (!found) continue
      chosen.push(found)
      usedDays.add(found.dayIndex)
    }
    chosen.sort((a, b) => a.dayIndex - b.dayIndex)
  }

  const fresh = chosen.map((c) => ({ start: c.start, end: c.end, label: rangeLabel(c.start, c.end, tz, opts.withDate ?? true) }))
  return [...kept, ...fresh].slice(0, count)
}

function dayKey(ms: number, tz: string) {
  const p = zonedParts(ms, tz)
  return `${p.year}-${p.month}-${p.day}`
}

export type OfferStep =
  | { kind: 'offer'; round: number; offers: Offer[]; proposed: Offer[] }
  | { kind: 'ask'; proposed: Offer[] }

export function offerRounds(offers: Offer[], s: AgendaSettings): Offer[][] {
  if (s.first_offer <= 0 || offers.length === 0) return []
  const rounds = [offers.slice(0, s.first_offer)]
  for (let i = s.first_offer; i < offers.length; i++) rounds.push([offers[i]])
  return rounds
}

function normalize(text: string) {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Une plage compte comme proposée si une bulle envoyée cite son jour et sa date.
export function offerMentioned(offer: Offer, texts: string[], tz: string) {
  const p = zonedParts(offer.start, tz)
  const weekday = new RegExp(`\\b${normalize(WEEKDAYS[p.weekday])}\\b`)
  const date = new RegExp(`(^|\\D)${p.day}(er)?(\\D|$)`)
  return texts.some((t) => {
    const n = normalize(t)
    return weekday.test(n) && date.test(n)
  })
}

export function nextOfferStep(offers: Offer[], s: AgendaSettings, sentTexts: string[], tz: string): OfferStep {
  const rounds = offerRounds(offers, s)
  let last = -1
  rounds.forEach((round, i) => {
    if (round.every((o) => offerMentioned(o, sentTexts, tz))) last = i
  })
  const proposed = rounds.slice(0, last + 1).flat()
  const next = rounds[last + 1]
  return next ? { kind: 'offer', round: last + 2, offers: next, proposed } : { kind: 'ask', proposed }
}

export type SlotCheck =
  | { ok: true; start: number; end: number; label: string }
  | { ok: false; reason: SlotRefusal; alternatives: { debut: string; label: string }[] }

export type SlotRefusal = 'format' | 'nonexistent' | 'too_soon' | 'too_far' | 'outside_hours' | 'busy'

export function parseLocalIso(value: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::00)?$/.exec(value.trim())
  if (!m) return null
  const [year, month, day, hour, minute] = m.slice(1).map(Number)
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null
  return { year, month, day, minutes: hour * 60 + minute }
}

function slotFits(start: number, s: AgendaSettings, tz: string) {
  const p = zonedParts(start, tz)
  const m = p.hour * 60 + p.minute
  return s.days[p.weekday] && m >= toMinutes(s.start) && m + s.duration_min <= toMinutes(s.end)
}

export function checkSlot(opts: { value: string; now: number; tz: string; settings: AgendaSettings; busy: Interval[] }): SlotCheck {
  const { now, tz, settings: s, busy } = opts
  const parsed = parseLocalIso(opts.value)
  const refuse = (reason: SlotRefusal, from: number): SlotCheck => ({
    ok: false,
    reason,
    alternatives: reason === 'format' ? [] : nearbySlots(Math.max(from, now), now, tz, s, busy),
  })
  if (!parsed) return refuse('format', now)
  const start = zonedToUtc(parsed.year, parsed.month, parsed.day, parsed.minutes, tz)
  if (start == null) {
    const approx = Date.UTC(parsed.year, parsed.month - 1, parsed.day, Math.floor(parsed.minutes / 60), parsed.minutes % 60)
    return refuse('nonexistent', approx)
  }
  const end = start + s.duration_min * 60_000
  if (parsed.minutes % STEP_MIN !== 0) return refuse('format', start)
  if (start < now + MIN_NOTICE_MS) return refuse('too_soon', now)
  if (start > now + (HORIZON_DAYS + 1) * 86_400_000) return refuse('too_far', now)
  if (!slotFits(start, s, tz)) return refuse('outside_hours', start)
  if (overlaps(start, end, busy)) return refuse('busy', start)
  return { ok: true, start, end, label: momentLabel(start, tz) }
}

// Les deux premiers moments libres à partir de l'heure demandée, par pas de 30 minutes.
function nearbySlots(from: number, now: number, tz: string, s: AgendaSettings, busy: Interval[]) {
  const out: { debut: string; label: string }[] = []
  const earliest = now + MIN_NOTICE_MS
  const limit = now + (HORIZON_DAYS + 1) * 86_400_000
  let t = Math.ceil(Math.max(from, earliest) / 1_800_000) * 1_800_000
  while (out.length < 2 && t <= limit) {
    const end = t + s.duration_min * 60_000
    if (slotFits(t, s, tz) && !overlaps(t, end, busy)) {
      out.push({ debut: localIso(t, tz), label: momentLabel(t, tz) })
      t += 3 * 3_600_000
    } else {
      t += 1_800_000
    }
  }
  return out
}

export const AGENDA_HORIZON_MS = (HORIZON_DAYS + 1) * 86_400_000

// Clé des plages mémorisées : un changement de réglage ou de fuseau les recalcule.
export function offersKey(s: AgendaSettings, tz: string) {
  return JSON.stringify([tz, s.duration_min, s.range_hours, s.first_offer, s.extra_offers, s.days, s.start, s.end])
}
