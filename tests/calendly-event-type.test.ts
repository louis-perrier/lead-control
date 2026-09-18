import { describe, expect, it } from 'vitest'
import { describeEventType } from '../supabase/functions/_shared/calendly-event-type'

const base = {
  uri: 'https://api.calendly.com/event_types/abc',
  name: 'Appel découverte',
  duration: 30,
  scheduling_url: 'https://calendly.com/moi/appel',
  active: true,
  kind: 'solo',
  pooling_type: null,
  locations: [{ kind: 'google_conference' }],
  // Les champs nom et e-mail ne figurent pas dans custom_questions, seulement les ajouts de l'hôte.
  custom_questions: [{ name: 'Un mot sur votre situation', type: 'text', enabled: true, required: false, position: 0 }],
}

describe('describeEventType', () => {
  it('accepte une page en visio sans question supplémentaire', () => {
    const info = describeEventType(base)
    expect(info.bookable).toBe(true)
    expect(info.blockers).toEqual([])
    expect(info.durationMin).toBe(30)
    expect(info.isVideo).toBe(true)
    expect(info.location).toEqual({ kind: 'google_conference' })
    expect(info.locationLabel).toBe('visio Google Meet')
  })

  it('ne compte pas une question obligatoire désactivée', () => {
    const info = describeEventType({
      ...base,
      custom_questions: [{ name: 'Votre budget', type: 'string', enabled: false, required: true, position: 1 }],
    })
    expect(info.requiredQuestions).toEqual([])
    expect(info.bookable).toBe(true)
  })

  it('garde réservable une question obligatoire que l’assistant peut poser', () => {
    const info = describeEventType({
      ...base,
      custom_questions: [{ name: 'Votre numéro', type: 'phone_number', enabled: true, required: true, position: 1 }],
    })
    expect(info.bookable).toBe(true)
    expect(info.requiredQuestions).toEqual(['Votre numéro'])
    expect(info.questions).toEqual([
      { name: 'Votre numéro', type: 'phone_number', position: 1, required: true, askable: true },
    ])
  })

  it('bloque sur une question à choix obligatoire, qui ne se devine pas', () => {
    const info = describeEventType({
      ...base,
      custom_questions: [{ name: 'Votre budget', type: 'single_select', enabled: true, required: true, position: 0 }],
    })
    expect(info.bookable).toBe(false)
    expect(info.blockers.join(' ')).toContain('Votre budget')
  })

  it('oublie une question désactivée et garde les questions facultatives', () => {
    const info = describeEventType({
      ...base,
      custom_questions: [
        { name: 'Caché', type: 'string', enabled: false, required: true, position: 0 },
        { name: 'Votre site', type: 'string', enabled: true, required: false, position: 1 },
      ],
    })
    expect(info.bookable).toBe(true)
    expect(info.questions.map((q) => q.name)).toEqual(['Votre site'])
    expect(info.requiredQuestions).toEqual([])
  })

  it('bloque un appel sortant, qui réclame le numéro du prospect', () => {
    const info = describeEventType({ ...base, locations: [{ kind: 'outbound_call' }] })
    expect(info.bookable).toBe(false)
    expect(info.location).toBeNull()
  })

  it('bloque une page qui laisse le prospect choisir le lieu', () => {
    const info = describeEventType({ ...base, locations: [{ kind: 'ask_invitee' }] })
    expect(info.bookable).toBe(false)
  })

  it('bloque une page à plusieurs lieux', () => {
    const info = describeEventType({ ...base, locations: [{ kind: 'google_conference' }, { kind: 'physical', location: 'Lyon' }] })
    expect(info.bookable).toBe(false)
    expect(info.locationKind).toBeNull()
  })

  it('bloque une page d’équipe', () => {
    expect(describeEventType({ ...base, pooling_type: 'round_robin' }).bookable).toBe(false)
  })

  it('bloque une page désactivée', () => {
    expect(describeEventType({ ...base, active: false }).bookable).toBe(false)
  })

  it('reprend l’adresse d’un rendez-vous sur place', () => {
    const info = describeEventType({ ...base, locations: [{ kind: 'physical', location: '12 rue de la Paix, Paris' }] })
    expect(info.bookable).toBe(true)
    expect(info.isVideo).toBe(false)
    expect(info.location).toEqual({ kind: 'physical', location: '12 rue de la Paix, Paris' })
  })

  it('bloque un rendez-vous sur place sans adresse', () => {
    const info = describeEventType({ ...base, locations: [{ kind: 'physical', location: '  ' }] })
    expect(info.bookable).toBe(false)
  })

  it('survit à une réponse vide', () => {
    const info = describeEventType({})
    expect(info.bookable).toBe(false)
    expect(info.name).toBe('Sans titre')
    expect(info.durationMin).toBe(30)
  })
})
