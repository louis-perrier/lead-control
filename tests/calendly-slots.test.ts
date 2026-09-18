import { describe, expect, it } from 'vitest'
import {
  calendlyOffersKey,
  checkCalendlySlot,
  computeCalendlyOffers,
  offerStillBookable,
  planCalendlyOffers,
  runsOf,
} from '../supabase/functions/_shared/calendly-slots'
import {
  CALENDLY_DEFAULTS,
  normalizeCalendly,
  type CalendlySettings,
} from '../supabase/functions/_shared/calendly-settings'
import { zonedToUtc } from '../supabase/functions/_shared/agenda-slots'

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

describe('computeCalendlyOffers', () => {
  const slots = [
    ...day(9, 18, 9, 19),
    ...day(9, 21, 9, 19),
    ...day(9, 23, 9, 19),
    ...day(9, 25, 9, 19),
  ]

  it('propose des jours espacés et des moments différents', () => {
    const offers = computeCalendlyOffers({ now: NOW, tz: TZ, settings, slots, count: 3 })
    expect(offers.map((o) => o.label)).toEqual([
      'vendredi 18 septembre entre 12 h et 15 h',
      'lundi 21 septembre entre 17 h et 19 h',
      'mercredi 23 septembre entre 9 h et 12 h',
    ])
  })

  it('ne propose jamais une plage sans créneau réservable', () => {
    const only = day(9, 18, 14, 16)
    const [offer] = computeCalendlyOffers({ now: NOW, tz: TZ, settings, slots: only, count: 1 })
    expect(offer.start).toBe(paris(9, 18, 14))
    expect(offer.end).toBe(paris(9, 18, 16))
  })

  it('écarte une suite qui ne tient qu’un seul créneau', () => {
    const offers = computeCalendlyOffers({ now: NOW, tz: TZ, settings, slots: [paris(9, 18, 14)], count: 2 })
    expect(offers).toEqual([])
  })

  it('garde les plages encore réservables et remplace les autres', () => {
    const keep = [
      { start: paris(9, 18, 12), end: paris(9, 18, 15), label: 'vendredi 18 septembre entre 12 h et 15 h' },
      { start: paris(9, 19, 12), end: paris(9, 19, 15), label: 'samedi 19 septembre entre 12 h et 15 h' },
    ]
    const offers = computeCalendlyOffers({ now: NOW, tz: TZ, settings, slots, count: 2, keep })
    expect(offers[0].label).toBe('vendredi 18 septembre entre 12 h et 15 h')
    expect(offers[1].label).not.toBe('samedi 19 septembre entre 12 h et 15 h')
  })

  it('laisse tomber une plage déjà passée', () => {
    const keep = [{ start: paris(9, 16, 12), end: paris(9, 16, 15), label: 'mercredi 16 septembre entre 12 h et 15 h' }]
    const offers = computeCalendlyOffers({ now: NOW, tz: TZ, settings, slots, count: 1, keep })
    expect(offers[0].start).toBeGreaterThan(NOW)
  })

  it('suit le passage à l’heure d’hiver', () => {
    // Dimanche 25 octobre 2026 : 3 h locales redeviennent 2 h.
    const late = [...day(10, 26, 9, 19)]
    const [offer] = computeCalendlyOffers({
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

describe('planCalendlyOffers', () => {
  const slots = [...day(9, 18, 9, 19), ...day(9, 21, 9, 19), ...day(9, 23, 9, 19), ...day(9, 25, 9, 19)]

  it('propose d’abord le nombre réglé', () => {
    const { step } = planCalendlyOffers({ now: NOW, tz: TZ, settings, slots, stored: null })
    expect(step.kind).toBe('offer')
    if (step.kind === 'offer') expect(step.offers).toHaveLength(2)
  })

  it('demande directement quand aucune plage n’est proposée', () => {
    const { step } = planCalendlyOffers({
      now: NOW,
      tz: TZ,
      settings: { ...settings, first_offer: 0 },
      slots,
      stored: null,
    })
    expect(step.kind).toBe('ask')
  })

  it('repropose une seule plage au tour suivant, puis demande', () => {
    const first = planCalendlyOffers({ now: NOW, tz: TZ, settings, slots, stored: null })
    const sent = { ...first.stored, sent: first.stored.offers.slice(0, 2).map((o) => o.start), rounds: 1 }
    const second = planCalendlyOffers({ now: NOW, tz: TZ, settings, slots, stored: sent })
    expect(second.step.kind).toBe('offer')
    if (second.step.kind === 'offer') {
      expect(second.step.offers).toHaveLength(1)
      expect(second.step.proposed).toHaveLength(2)
    }
    const third = planCalendlyOffers({ now: NOW, tz: TZ, settings, slots, stored: { ...second.stored, rounds: 2 } })
    expect(third.step.kind).toBe('ask')
  })

  it('oublie les plages mémorisées quand la page de réservation change', () => {
    const first = planCalendlyOffers({ now: NOW, tz: TZ, settings, slots, stored: null })
    const other = planCalendlyOffers({
      now: NOW,
      tz: TZ,
      settings: { ...settings, event_type_uri: 'https://api.calendly.com/event_types/zzz' },
      slots,
      stored: first.stored,
    })
    expect(other.stored.sent).toEqual([])
    expect(other.stored.rounds).toBe(0)
  })
})

describe('checkCalendlySlot', () => {
  const slots = day(9, 18, 9, 12)

  it('accepte un créneau réservable', () => {
    const check = checkCalendlySlot({ value: '2026-09-18T10:30', slots, durationMin: 30, tz: TZ })
    expect(check.ok).toBe(true)
    if (check.ok) {
      expect(check.start).toBe(paris(9, 18, 10, 30))
      expect(check.label).toBe('vendredi 18 septembre à 10 h 30')
    }
  })

  it('refuse une heure illisible sans proposer de repli', () => {
    const check = checkCalendlySlot({ value: 'demain vers midi', slots, durationMin: 30, tz: TZ })
    expect(check.ok).toBe(false)
    if (!check.ok) {
      expect(check.reason).toBe('format')
      expect(check.alternatives).toEqual([])
    }
  })

  it('refuse un créneau absent et propose deux repères espacés', () => {
    const check = checkCalendlySlot({ value: '2026-09-18T13:00', slots, durationMin: 30, tz: TZ })
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
    const check = checkCalendlySlot({ value: '2026-03-29T02:30', slots, durationMin: 30, tz: TZ })
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
    expect(calendlyOffersKey(settings, TZ)).not.toBe(calendlyOffersKey({ ...settings, range_hours: 2 }, TZ))
  })
})
