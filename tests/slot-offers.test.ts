import { describe, expect, it } from 'vitest'
import {
  bookingOffersKey,
  checkBookingSlot,
  computeBookingOffers,
  offerStillBookable,
  planBookingOffers,
  runsOf,
} from '../supabase/functions/_shared/slot-offers'
import {
  CALENDLY_DEFAULTS,
  normalizeCalendly,
  type CalendlySettings,
} from '../supabase/functions/_shared/calendly-settings'
import { zonedParts, zonedToUtc } from '../supabase/functions/_shared/agenda-slots'

const TZ = 'Europe/Paris'
// Jeudi 17 septembre 2026, 15 h à Paris.
const NOW = Date.UTC(2026, 8, 17, 13, 0)
const settings: CalendlySettings = { ...CALENDLY_DEFAULTS, event_type_uri: 'https://api.calendly.com/event_types/abc' }
const paris = (month: number, day: number, hour: number, minute = 0) => zonedToUtc(2026, month, day, hour * 60 + minute, TZ)!

// Créneaux d'un jour, du début à la fin, par pas de `step` minutes.
function day(month: number, dayOfMonth: number, from: number, to: number, step = 30) {
  const out: number[] = []
  for (let m = from * 60; m + step <= to * 60; m += step) out.push(paris(month, dayOfMonth, Math.floor(m / 60), m % 60))
  return out
}

describe('runsOf', () => {
  it('regroupe les créneaux qui se suivent et coupe sur un trou plus grand que l’appel', () => {
    const slots = [...day(9, 18, 9, 11), ...day(9, 18, 15, 17)]
    const runs = runsOf(slots, 30)
    expect(runs).toHaveLength(2)
    expect(runs[0].start).toBe(paris(9, 18, 9))
    expect(runs[0].end).toBe(paris(9, 18, 11))
    expect(runs[1].start).toBe(paris(9, 18, 15))
  })

  it('garde une seule suite quand le trou vaut exactement la durée de l’appel', () => {
    const slots = [paris(9, 18, 9), paris(9, 18, 10)]
    expect(runsOf(slots, 60)).toHaveLength(1)
    expect(runsOf(slots, 30)).toHaveLength(2)
  })

  it('trie les créneaux reçus dans le désordre', () => {
    const runs = runsOf([paris(9, 18, 10), paris(9, 18, 9), paris(9, 18, 9, 30)], 30)
    expect(runs).toHaveLength(1)
    expect(runs[0].slots).toEqual([paris(9, 18, 9), paris(9, 18, 9, 30), paris(9, 18, 10)])
  })
})

describe('computeBookingOffers', () => {
  const slots = [
    ...day(9, 18, 9, 19),
    ...day(9, 21, 9, 19),
    ...day(9, 23, 9, 19),
    ...day(9, 25, 9, 19),
  ]

  it('propose des jours espacés et des moments différents', () => {
    const offers = computeBookingOffers({ now: NOW, tz: TZ, settings, slots, count: 3 })
    expect(offers.map((o) => o.label)).toEqual([
      'vendredi 18 septembre entre 12 h et 15 h',
      'lundi 21 septembre entre 17 h et 19 h',
      'mercredi 23 septembre entre 9 h et 12 h',
    ])
  })

  it('ne propose jamais une plage sans créneau réservable', () => {
    const only = day(9, 18, 14, 16)
    const [offer] = computeBookingOffers({ now: NOW, tz: TZ, settings, slots: only, count: 1 })
    expect(offer.start).toBe(paris(9, 18, 14))
    expect(offer.end).toBe(paris(9, 18, 16))
  })

  it('écarte une suite qui ne tient qu’un seul créneau', () => {
    const offers = computeBookingOffers({ now: NOW, tz: TZ, settings, slots: [paris(9, 18, 14)], count: 2 })
    expect(offers).toEqual([])
  })

  it('garde les plages encore réservables et remplace les autres', () => {
    const keep = [
      { start: paris(9, 18, 12), end: paris(9, 18, 15), label: 'vendredi 18 septembre entre 12 h et 15 h' },
      { start: paris(9, 19, 12), end: paris(9, 19, 15), label: 'samedi 19 septembre entre 12 h et 15 h' },
    ]
    const offers = computeBookingOffers({ now: NOW, tz: TZ, settings, slots, count: 2, keep })
    expect(offers[0].label).toBe('vendredi 18 septembre entre 12 h et 15 h')
    expect(offers[1].label).not.toBe('samedi 19 septembre entre 12 h et 15 h')
  })

  it('laisse tomber une plage déjà passée', () => {
    const keep = [{ start: paris(9, 16, 12), end: paris(9, 16, 15), label: 'mercredi 16 septembre entre 12 h et 15 h' }]
    const offers = computeBookingOffers({ now: NOW, tz: TZ, settings, slots, count: 1, keep })
    expect(offers[0].start).toBeGreaterThan(NOW)
  })

  it('suit le passage à l’heure d’hiver', () => {
    // Dimanche 25 octobre 2026 : 3 h locales redeviennent 2 h.
    const late = [...day(10, 26, 9, 19)]
    const [offer] = computeBookingOffers({
      now: Date.UTC(2026, 9, 24, 13, 0),
      tz: TZ,
      settings,
      slots: late,
      count: 1,
    })
    expect(offer.label).toBe('lundi 26 octobre entre 12 h et 15 h')
    expect(offer.end - offer.start).toBe(3 * 3_600_000)
  })
})

describe('offerStillBookable', () => {
  const offer = { start: paris(9, 18, 12), end: paris(9, 18, 15), label: 'x' }

  it('reste vraie tant que deux créneaux tiennent dans la plage', () => {
    expect(offerStillBookable(offer, [paris(9, 18, 12), paris(9, 18, 14, 30)], 30)).toBe(true)
  })

  it('devient fausse quand il n’en reste qu’un', () => {
    expect(offerStillBookable(offer, [paris(9, 18, 12)], 30)).toBe(false)
  })

  it('ignore un créneau qui déborde de la plage', () => {
    expect(offerStillBookable(offer, [paris(9, 18, 12), paris(9, 18, 14, 45)], 30)).toBe(false)
  })
})

const PAGE = 'https://api.calendly.com/event_types/aaa'

describe('planBookingOffers', () => {
  const slots = [...day(9, 18, 9, 19), ...day(9, 21, 9, 19), ...day(9, 23, 9, 19), ...day(9, 25, 9, 19)]

  it('propose d’abord le nombre réglé', () => {
    const { step } = planBookingOffers({ now: NOW, tz: TZ, settings, page: PAGE, slots, stored: null })
    expect(step.kind).toBe('offer')
    if (step.kind === 'offer') expect(step.offers).toHaveLength(2)
  })

  it('demande directement quand aucune plage n’est proposée', () => {
    const { step } = planBookingOffers({
      now: NOW,
      tz: TZ,
      settings: { ...settings, first_offer: 0 },
      page: PAGE,
      slots,
      stored: null,
    })
    expect(step.kind).toBe('ask')
  })

  it('repropose une seule plage au tour suivant, puis demande', () => {
    const first = planBookingOffers({ now: NOW, tz: TZ, settings, page: PAGE, slots, stored: null })
    const sent = { ...first.stored, sent: first.stored.offers.slice(0, 2).map((o) => o.start), rounds: 1 }
    const second = planBookingOffers({ now: NOW, tz: TZ, settings, page: PAGE, slots, stored: sent })
    expect(second.step.kind).toBe('offer')
    if (second.step.kind === 'offer') {
      expect(second.step.offers).toHaveLength(1)
      expect(second.step.proposed).toHaveLength(2)
    }
    const third = planBookingOffers({ now: NOW, tz: TZ, settings, page: PAGE, slots, stored: { ...second.stored, rounds: 2 } })
    expect(third.step.kind).toBe('ask')
  })

  it('oublie les plages mémorisées quand la page de réservation change', () => {
    const first = planBookingOffers({ now: NOW, tz: TZ, settings, page: PAGE, slots, stored: null })
    const other = planBookingOffers({
      now: NOW,
      tz: TZ,
      settings,
      page: 'https://api.calendly.com/event_types/zzz',
      slots,
      stored: first.stored,
    })
    expect(other.stored.sent).toEqual([])
    expect(other.stored.rounds).toBe(0)
  })
})

describe('délai minimum', () => {
  it('écarte les créneaux trop proches des propositions', () => {
    const patient: CalendlySettings = { ...settings, notice_hours: 48 }
    const slots = [...day(9, 18, 9, 12), ...day(9, 21, 9, 12)]
    const offers = computeBookingOffers({ now: NOW, tz: TZ, settings: patient, slots, count: 2 })
    for (const o of offers) expect(o.start).toBeGreaterThanOrEqual(NOW + 48 * 3_600_000)
  })

  it('refuse une heure demandée par le prospect sous le délai', () => {
    const slots = day(9, 18, 9, 12)
    const check = checkBookingSlot({
      value: '2026-09-18T10:30',
      slots,
      durationMin: 30,
      tz: TZ,
      now: NOW,
      noticeHours: 48,
    })
    expect(check.ok).toBe(false)
  })

  it('ne change rien quand le délai vaut zéro', () => {
    const slots = day(9, 18, 9, 12)
    const libre = computeBookingOffers({ now: NOW, tz: TZ, settings, slots, count: 1 })
    expect(libre).toHaveLength(1)
  })

  it('recalcule les propositions mémorisées quand le délai change', () => {
    expect(bookingOffersKey(settings, TZ, 'page')).not.toBe(
      bookingOffersKey({ ...settings, notice_hours: 24 }, TZ, 'page'),
    )
  })
})

describe('checkBookingSlot', () => {
  const slots = day(9, 18, 9, 12)
  const NOW = paris(9, 18, 8)

  it('accepte un créneau réservable', () => {
    const check = checkBookingSlot({ value: '2026-09-18T10:30', slots, durationMin: 30, tz: TZ, now: NOW, noticeHours: 0 })
    expect(check.ok).toBe(true)
    if (check.ok) {
      expect(check.start).toBe(paris(9, 18, 10, 30))
      expect(check.label).toBe('vendredi 18 septembre à 10 h 30')
    }
  })

  it('refuse une heure illisible sans proposer de repli', () => {
    const check = checkBookingSlot({ value: 'demain vers midi', slots, durationMin: 30, tz: TZ, now: NOW, noticeHours: 0 })
    expect(check.ok).toBe(false)
    if (!check.ok) {
      expect(check.reason).toBe('format')
      expect(check.alternatives).toEqual([])
    }
  })

  it('refuse un créneau absent et propose deux repères espacés', () => {
    const check = checkBookingSlot({ value: '2026-09-18T13:00', slots, durationMin: 30, tz: TZ, now: NOW, noticeHours: 0 })
    expect(check.ok).toBe(false)
    if (!check.ok) {
      expect(check.reason).toBe('unavailable')
      expect(check.alternatives).toHaveLength(2)
      const [a, b] = check.alternatives.map((x) => Date.parse(`${x.debut}:00Z`))
      expect(b - a).toBeGreaterThanOrEqual(90 * 60_000)
    }
  })

  it('refuse une heure locale qui n’existe pas', () => {
    // Dimanche 29 mars 2026 : 2 h 30 locales n'existent pas.
    const check = checkBookingSlot({ value: '2026-03-29T02:30', slots, durationMin: 30, tz: TZ, now: NOW, noticeHours: 0 })
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.reason).toBe('nonexistent')
  })
})

describe('normalizeCalendly', () => {
  it('remplit les valeurs par défaut', () => {
    expect(normalizeCalendly(undefined)).toEqual(CALENDLY_DEFAULTS)
  })

  it('borne les réglages hors limites', () => {
    const s = normalizeCalendly({ range_hours: 12, first_offer: 9, extra_offers: -3, duration_min: 0 })
    expect(s.range_hours).toBe(4)
    expect(s.first_offer).toBe(3)
    expect(s.extra_offers).toBe(0)
    expect(s.duration_min).toBe(5)
  })

  it('change de clé quand un réglage bouge', () => {
    expect(bookingOffersKey(settings, TZ, 'uri')).not.toBe(bookingOffersKey({ ...settings, range_hours: 2 }, TZ, 'uri'))
    expect(bookingOffersKey(settings, TZ, 'uri')).not.toBe(bookingOffersKey(settings, TZ, 'autre'))
  })
})

describe('mode créneaux précis', () => {
  const exact: CalendlySettings = { ...settings, offer_style: 'slot' }

  it('propose deux heures exactes du même jour', () => {
    const offers = computeBookingOffers({ now: NOW, tz: TZ, settings: exact, slots: day(9, 18, 9, 18), count: 2 })
    expect(offers).toHaveLength(2)
    expect(offers[0].end - offers[0].start).toBe(30 * 60_000)
    expect(new Date(offers[0].start).toISOString().slice(0, 10)).toBe(new Date(offers[1].start).toISOString().slice(0, 10))
    expect(offers[1].start - offers[0].start).toBeGreaterThanOrEqual(2 * 3_600_000)
    expect(offers[0].label).toContain('à')
    expect(offers[0].label).not.toContain('entre')
  })

  it('pose les deux heures du même jour sur deux moments différents', () => {
    const offers = computeBookingOffers({ now: NOW, tz: TZ, settings: exact, slots: day(9, 18, 9, 18), count: 2 })
    const heures = offers.map((o) => zonedParts(o.start, TZ).hour)
    expect(heures[0]).toBeLessThan(12)
    expect(heures[1]).toBeGreaterThanOrEqual(12)
  })

  it('repart sur deux jours quand la journée n’a qu’un seul moment', () => {
    const slots = [...day(9, 18, 9, 11, 30), ...day(9, 21, 9, 11, 30)]
    const offers = computeBookingOffers({ now: NOW, tz: TZ, settings: exact, slots, count: 2 })
    expect(offers).toHaveLength(2)
    expect(new Date(offers[0].start).toISOString().slice(0, 10)).not.toBe(
      new Date(offers[1].start).toISOString().slice(0, 10),
    )
  })

  it('retombe sur deux jours quand la journée n’offre qu’un créneau', () => {
    const slots = [paris(9, 18, 14), paris(9, 21, 10), paris(9, 23, 16)]
    const offers = computeBookingOffers({ now: NOW, tz: TZ, settings: exact, slots, count: 2 })
    expect(offers).toHaveLength(2)
    expect(offers[0].start).not.toBe(offers[1].start)
    expect(new Date(offers[0].start).toISOString().slice(0, 10)).not.toBe(
      new Date(offers[1].start).toISOString().slice(0, 10),
    )
  })

  it('propose un créneau posé hors de l’heure pleine, que le mode plage écarte', () => {
    const slots = [paris(9, 18, 9, 30), paris(9, 18, 14, 30), paris(9, 18, 17, 30)]
    const offers = computeBookingOffers({ now: NOW, tz: TZ, settings: exact, slots, count: 2 })
    expect(offers.map((o) => o.start)).toContain(paris(9, 18, 9, 30))
  })

  it('oublie une proposition dès que son créneau est pris', () => {
    const offer = { start: paris(9, 18, 14), end: paris(9, 18, 14, 30), label: 'x' }
    expect(offerStillBookable(offer, [paris(9, 18, 14)], 30, 'slot')).toBe(true)
    expect(offerStillBookable(offer, [paris(9, 18, 14, 30)], 30, 'slot')).toBe(false)
  })

  it('part sur un autre jour au tour de refus', () => {
    const slots = [...day(9, 18, 9, 18), ...day(9, 21, 9, 18)]
    const first = planBookingOffers({ now: NOW, tz: TZ, settings: exact, page: PAGE, slots, stored: null })
    expect(first.step.kind).toBe('offer')
    if (first.step.kind !== 'offer') return
    const sent = { ...first.stored, sent: first.step.offers.map((o) => o.start), rounds: 1 }
    const second = planBookingOffers({ now: NOW, tz: TZ, settings: exact, page: PAGE, slots, stored: sent })
    if (second.step.kind !== 'offer') throw new Error('attendu: une nouvelle proposition')
    const days = second.step.offers.map((o) => new Date(o.start).toISOString().slice(0, 10))
    const before = first.step.offers.map((o) => new Date(o.start).toISOString().slice(0, 10))
    expect(days.some((d) => before.includes(d))).toBe(false)
  })

  it('change de clé quand le style change', () => {
    expect(bookingOffersKey(settings, TZ, 'uri')).not.toBe(bookingOffersKey(exact, TZ, 'uri'))
  })
})
