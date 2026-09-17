import { describe, expect, it } from 'vitest'
import {
  AGENDA_DEFAULTS,
  agendaSettingsError,
  checkSlot,
  computeOffers,
  localIso,
  nextOfferStep,
  normalizeAgenda,
  offerMentioned,
  rangeLabel,
  zonedToUtc,
  type AgendaSettings,
} from '../supabase/functions/_shared/agenda-slots'

const TZ = 'Europe/Paris'
// Jeudi 17 septembre 2026, 15 h à Paris.
const NOW = Date.UTC(2026, 8, 17, 13, 0)
const settings: AgendaSettings = { ...AGENDA_DEFAULTS, duration_min: 60, range_hours: 3, first_offer: 2, extra_offers: 1 }
const paris = (month: number, day: number, hour: number, minute = 0) => zonedToUtc(2026, month, day, hour * 60 + minute, TZ)!

describe('computeOffers', () => {
  it('propose des plages libres sur des jours espacés et des moments différents', () => {
    const offers = computeOffers({ now: NOW, tz: TZ, settings, busy: [] })
    expect(offers.map((o) => o.label)).toEqual([
      'vendredi 18 septembre entre 12 h et 15 h',
      'lundi 21 septembre entre 9 h et 12 h',
      'mercredi 23 septembre entre 12 h et 15 h',
    ])
  })

  it('écarte une plage où l’agenda est pris', () => {
    const busy = [{ start: paris(9, 18, 12), end: paris(9, 18, 13) }]
    const [first] = computeOffers({ now: NOW, tz: TZ, settings, busy })
    expect(first.label).toBe('vendredi 18 septembre entre 13 h et 16 h')
  })

  it('garde les plages encore valides et remplace les autres', () => {
    const initial = computeOffers({ now: NOW, tz: TZ, settings, busy: [] })
    const busy = [{ start: initial[1].start, end: initial[1].start + 3_600_000 }]
    const next = computeOffers({ now: NOW, tz: TZ, settings, busy, keep: initial })
    expect(next[0]).toEqual(initial[0])
    expect(next[1]).toEqual(initial[2])
    expect(next).toHaveLength(3)
    expect(new Set(next.map((o) => o.label.split(' ').slice(0, 2).join(' '))).size).toBe(3)
  })

  it('ne propose rien quand l’agenda est plein', () => {
    const busy = [{ start: NOW, end: NOW + 30 * 86_400_000 }]
    expect(computeOffers({ now: NOW, tz: TZ, settings, busy })).toEqual([])
  })

  it('suit le passage à l’heure d’hiver', () => {
    const now = Date.UTC(2026, 9, 23, 8, 0)
    const offers = computeOffers({ now, tz: TZ, settings, busy: [], count: 1 })
    expect(offers[0].label).toBe('lundi 26 octobre entre 12 h et 15 h')
    expect(offers[0].start).toBe(Date.UTC(2026, 9, 26, 11, 0))
  })

  it('peut omettre la date pour l’aperçu', () => {
    const [o] = computeOffers({ now: NOW, tz: TZ, settings, busy: [], count: 1, withDate: false })
    expect(o.label).toBe('vendredi entre 12 h et 15 h')
  })

  it('n’en calcule aucune quand l’agent demande directement', () => {
    const offers = computeOffers({ now: NOW, tz: TZ, settings: { ...settings, first_offer: 0 }, busy: [] })
    expect(offers).toEqual([])
  })
})

describe('zonedToUtc', () => {
  it('refuse une heure qui n’existe pas', () => {
    expect(zonedToUtc(2027, 3, 28, 150, TZ)).toBeNull()
  })

  it('accepte une heure qui existe deux fois', () => {
    expect(zonedToUtc(2026, 10, 25, 150, TZ)).not.toBeNull()
  })
})

describe('nextOfferStep', () => {
  const offers = computeOffers({ now: NOW, tz: TZ, settings, busy: [] })

  it('commence par les plages du premier tour', () => {
    const step = nextOfferStep(offers, settings, [], TZ)
    expect(step).toMatchObject({ kind: 'offer', round: 1 })
    expect(step.kind === 'offer' && step.offers).toHaveLength(2)
  })

  it('passe à la nouvelle plage puis à la question ouverte', () => {
    const first = 'Je suis dispo vendredi 18 septembre entre 12 h et 15 h, ou lundi 21 entre 9 h et 12 h.'
    const second = nextOfferStep(offers, settings, [first], TZ)
    expect(second).toMatchObject({ kind: 'offer', round: 2 })
    expect(second.kind === 'offer' && second.offers[0].label).toBe('mercredi 23 septembre entre 12 h et 15 h')

    const ask = nextOfferStep(offers, settings, [first, 'Sinon mercredi 23 septembre entre 12 h et 15 h ?'], TZ)
    expect(ask).toEqual({ kind: 'ask', proposed: offers })
  })

  it('demande directement sans plage à proposer', () => {
    expect(nextOfferStep([], { ...settings, first_offer: 0 }, [], TZ)).toEqual({ kind: 'ask', proposed: [] })
  })

  it('reconnaît le premier du mois', () => {
    const offer = { start: paris(10, 1, 12), end: paris(10, 1, 15), label: '' }
    expect(rangeLabel(offer.start, offer.end, TZ)).toBe('jeudi 1er octobre entre 12 h et 15 h')
    expect(offerMentioned(offer, ['Jeudi 1er octobre ça te va ?'], TZ)).toBe(true)
    expect(offerMentioned(offer, ['Jeudi 11 octobre ça te va ?'], TZ)).toBe(false)
  })
})

describe('checkSlot', () => {
  const base = { now: NOW, tz: TZ, settings, busy: [] }

  it('accepte un moment libre dans les heures d’appel', () => {
    expect(checkSlot({ ...base, value: '2026-09-18T14:00' })).toEqual({
      ok: true,
      start: paris(9, 18, 14),
      end: paris(9, 18, 15),
      label: 'vendredi 18 septembre à 14 h',
    })
  })

  it('refuse un format ou un pas invalide', () => {
    expect(checkSlot({ ...base, value: 'vendredi 14h' })).toMatchObject({ ok: false, reason: 'format' })
    expect(checkSlot({ ...base, value: '2026-09-18T14:10' })).toMatchObject({ ok: false, reason: 'format' })
  })

  it('refuse un moment trop proche et propose la suite', () => {
    const res = checkSlot({ ...base, value: '2026-09-17T16:00' })
    expect(res).toMatchObject({ ok: false, reason: 'too_soon' })
    expect(!res.ok && res.alternatives[0]).toEqual({ debut: '2026-09-17T17:00', label: 'jeudi 17 septembre à 17 h' })
  })

  it('refuse un week-end et propose le jour ouvré suivant', () => {
    const res = checkSlot({ ...base, value: '2026-09-19T10:00' })
    expect(res).toMatchObject({ ok: false, reason: 'outside_hours' })
    expect(!res.ok && res.alternatives.map((a) => a.debut)).toEqual(['2026-09-21T09:00', '2026-09-21T12:00'])
  })

  it('refuse un appel qui déborde de la fin de journée', () => {
    expect(checkSlot({ ...base, value: '2026-09-18T18:30' })).toMatchObject({ ok: false, reason: 'outside_hours' })
  })

  it('refuse un moment pris et propose le prochain libre', () => {
    const busy = [{ start: paris(9, 18, 14), end: paris(9, 18, 16) }]
    const res = checkSlot({ ...base, busy, value: '2026-09-18T14:30' })
    expect(res).toMatchObject({ ok: false, reason: 'busy' })
    expect(!res.ok && res.alternatives[0].debut).toBe('2026-09-18T16:00')
  })

  it('refuse un moment au-delà de l’horizon', () => {
    expect(checkSlot({ ...base, value: '2026-11-18T14:00' })).toMatchObject({ ok: false, reason: 'too_far' })
  })
})

describe('réglages', () => {
  it('remet les valeurs par défaut sur un réglage absent ou invalide', () => {
    expect(normalizeAgenda(undefined)).toEqual(AGENDA_DEFAULTS)
    expect(normalizeAgenda({ duration_min: 17, first_offer: 9, days: [true] })).toMatchObject({
      duration_min: AGENDA_DEFAULTS.duration_min,
      first_offer: 3,
      days: AGENDA_DEFAULTS.days,
    })
  })

  it('signale une plage plus courte que l’appel ou plus longue que la journée', () => {
    expect(agendaSettingsError({ ...settings, duration_min: 90, range_hours: 1 })).toMatch(/au moins le temps/)
    expect(agendaSettingsError({ ...settings, start: '09:00', end: '11:00', range_hours: 3 })).toMatch(/dépasser/)
    expect(agendaSettingsError(settings)).toBeNull()
  })

  it('écrit une heure locale lisible par les outils', () => {
    expect(localIso(paris(9, 18, 9, 45), TZ)).toBe('2026-09-18T09:45')
  })
})
