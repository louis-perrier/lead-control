import { describe, expect, it } from 'vitest'
import { describeIcloseEvent, listOf, parseAvailabilities } from '../supabase/functions/_shared/iclose-event'
import { ICLOSE_DEFAULTS, normalizeIclose } from '../supabase/functions/_shared/iclose-settings'
import { zonedToUtc } from '../supabase/functions/_shared/agenda-slots'

const TZ = 'Europe/Paris'
const paris = (month: number, day: number, hour: number, minute = 0) =>
  zonedToUtc(2026, month, day, hour * 60 + minute, TZ)!

describe('listOf', () => {
  it('accepte une liste nue comme une liste enveloppée', () => {
    expect(listOf([{ id: 'a' }])).toEqual([{ id: 'a' }])
    expect(listOf({ data: [{ id: 'b' }] })).toEqual([{ id: 'b' }])
    expect(listOf({ items: [{ id: 'c' }] })).toEqual([{ id: 'c' }])
    expect(listOf({ data: { items: [{ id: 'd' }] } })).toEqual([{ id: 'd' }])
  })

  it('ne casse pas sur une réponse vide ou inattendue', () => {
    expect(listOf(null)).toEqual([])
    expect(listOf({ message: 'ok' })).toEqual([])
  })
})

describe('describeIcloseEvent', () => {
  it('lit une page réservable', () => {
    const event = describeIcloseEvent({
      id: '42',
      name: 'Appel découverte',
      linkPrefix: 'louis/appel',
      duration: 45,
      bookingUrl: 'https://iclosed.io/louis/appel',
    })
    expect(event).toEqual({
      id: '42',
      linkPrefix: 'louis/appel',
      name: 'Appel découverte',
      durationMin: 45,
      bookingUrl: 'https://iclosed.io/louis/appel',
      active: true,
      bookable: true,
      blockers: [],
    })
  })

  it('reconstruit le lien public quand iClose ne le donne pas', () => {
    expect(describeIcloseEvent({ id: '1', linkPrefix: 'louis/appel' }).bookingUrl).toBe('https://iclosed.io/louis/appel')
  })

  it('bloque une page désactivée ou sans lien public', () => {
    expect(describeIcloseEvent({ id: '1', linkPrefix: 'louis/appel', status: 'DEACTIVATED' }).bookable).toBe(false)
    const orphan = describeIcloseEvent({ id: '2', name: 'Sans lien' })
    expect(orphan.bookable).toBe(false)
    expect(orphan.blockers.join(' ')).toContain('lien public')
  })

  it('retombe sur 30 min quand la durée manque', () => {
    expect(describeIcloseEvent({ id: '1', linkPrefix: 'a/b' }).durationMin).toBe(30)
  })
})

describe('parseAvailabilities', () => {
  it('lit la forme documentée, date par date', () => {
    const slots = parseAvailabilities(
      { availabilities: { '2026-09-18': ['09:00', '09:30'], '2026-09-21': ['14:00'] } },
      TZ,
    )
    expect(slots).toEqual([paris(9, 18, 9), paris(9, 18, 9, 30), paris(9, 21, 14)])
  })

  it('lit une liste de journées et des horodatages complets', () => {
    expect(parseAvailabilities({ data: { availabilities: [{ date: '2026-09-18', times: ['10:00'] }] } }, TZ)).toEqual([
      paris(9, 18, 10),
    ])
    expect(parseAvailabilities({ availabilities: ['2026-09-18T08:00:00.000Z'] }, TZ)).toEqual([paris(9, 18, 10)])
  })

  it('trie, dédoublonne et ignore ce qui n’est pas lisible', () => {
    const slots = parseAvailabilities(
      { availabilities: { '2026-09-18': ['09:30', '09:00', '09:30', 'midi', ''] } },
      TZ,
    )
    expect(slots).toEqual([paris(9, 18, 9), paris(9, 18, 9, 30)])
  })

  it('rend une liste vide sur une réponse inattendue', () => {
    expect(parseAvailabilities(null, TZ)).toEqual([])
    expect(parseAvailabilities({ message: 'no slots' }, TZ)).toEqual([])
  })
})

describe('normalizeIclose', () => {
  it('rend les valeurs par défaut sur une entrée vide', () => {
    expect(normalizeIclose(null)).toEqual(ICLOSE_DEFAULTS)
  })

  it('borne les nombres et nettoie les chaînes', () => {
    const s = normalizeIclose({ link_prefix: '  louis/appel  ', duration_min: 900, first_offer: 9, extra_offers: -1 })
    expect(s.link_prefix).toBe('louis/appel')
    expect(s.duration_min).toBe(480)
    expect(s.first_offer).toBe(3)
    expect(s.extra_offers).toBe(0)
  })

  it('plafonne les informations à demander', () => {
    const s = normalizeIclose({
      extra_fields: [
        { label: 'Un', kind: 'phone' },
        { label: '  ', kind: 'text' },
        { label: 'un', kind: 'text' },
        { label: 'Deux', kind: 'email' },
        { label: 'Trois', kind: 'text' },
        { label: 'Quatre', kind: 'text' },
      ],
    })
    expect(s.extra_fields).toEqual([
      { label: 'Un', kind: 'phone' },
      { label: 'Deux', kind: 'email' },
      { label: 'Trois', kind: 'text' },
    ])
  })
})
