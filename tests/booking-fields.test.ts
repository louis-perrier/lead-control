import { describe, expect, it } from 'vitest'
import { buildAsks, collectAnswers } from '../supabase/functions/_shared/booking-fields'
import { normalizeCalendly } from '../supabase/functions/_shared/calendly-settings'
import { hasEmailField, hasUnnamedField, KIND_DEFAULT_LABEL, normalizeFields } from '../supabase/functions/_shared/booking-settings'
import { normalizeIclose } from '../supabase/functions/_shared/iclose-settings'
import type { EventQuestion } from '../supabase/functions/_shared/calendly-event-type'

const question = (over: Partial<EventQuestion>): EventQuestion => ({
  name: 'Question',
  type: 'string',
  position: 0,
  required: false,
  askable: true,
  ...over,
})

describe('buildAsks', () => {
  it('ne demande rien quand rien n’est réglé ni imposé', () => {
    expect(buildAsks([], [])).toEqual([])
  })

  it('rattache un champ téléphone à la question téléphone de la page', () => {
    const asks = buildAsks(
      [{ label: 'Ton numéro', kind: 'phone' }],
      [question({ name: 'Votre numéro', type: 'phone_number', position: 2, required: true })],
    )
    expect(asks).toEqual([
      { key: 'champ1', label: 'Ton numéro', kind: 'phone', required: true, question: 'Votre numéro', position: 2 },
    ])
  })

  it('rattache un champ texte à la question de même libellé, accents compris', () => {
    const asks = buildAsks(
      [{ label: 'Votre societe', kind: 'text' }],
      [question({ name: 'Votre société', position: 1 })],
    )
    expect(asks[0].position).toBe(1)
    expect(asks[0].question).toBe('Votre société')
  })

  it('garde un champ sans équivalent chez Calendly, sans position', () => {
    const asks = buildAsks([{ label: 'Ton budget', kind: 'text' }], [])
    expect(asks[0]).toMatchObject({ question: null, position: null, required: false })
  })

  it('ajoute les questions obligatoires que rien ne couvre', () => {
    const asks = buildAsks(
      [{ label: 'Ton budget', kind: 'text' }],
      [question({ name: 'Votre site', position: 3, required: true }), question({ name: 'Optionnelle', position: 4 })],
    )
    expect(asks.map((a) => a.label)).toEqual(['Ton budget', 'Votre site'])
    expect(asks[1]).toMatchObject({ key: 'question3', required: true, position: 3 })
  })

  it('ne demande pas deux fois la même question', () => {
    const asks = buildAsks(
      [{ label: 'Votre numéro', kind: 'phone' }],
      [question({ name: 'Votre numéro', type: 'phone_number', position: 0, required: true })],
    )
    expect(asks).toHaveLength(1)
  })

  it('suit l’ordre et le plafond des réglages', () => {
    const settings = normalizeCalendly({
      extra_fields: [
        { label: 'Un', kind: 'text' },
        { label: 'Deux', kind: 'phone' },
        { label: 'Trois', kind: 'text' },
        { label: 'Quatre', kind: 'text' },
      ],
    })
    expect(buildAsks(settings.extra_fields, []).map((a) => a.key)).toEqual(['champ1', 'champ2', 'champ3'])
  })
})

describe('collectAnswers', () => {
  const asks = buildAsks(
    [
      { label: 'Ton numéro', kind: 'phone' },
      { label: 'Ton budget', kind: 'text' },
    ],
    [question({ name: 'Votre numéro', type: 'phone_number', position: 2, required: true })],
  )

  it('renvoie à Calendly ce qui a une position, garde le reste sur la fiche', () => {
    const out = collectAnswers(asks, { champ1: ' 06 12 34 56 78 ', champ2: '5000 euros' })
    expect(out.answers).toEqual([{ question: 'Votre numéro', answer: '06 12 34 56 78', position: 2 }])
    expect(out.saved).toEqual([
      { label: 'Ton numéro', value: '06 12 34 56 78' },
      { label: 'Ton budget', value: '5000 euros' },
    ])
    expect(out.phone).toBe('06 12 34 56 78')
    expect(out.missing).toEqual([])
  })

  it('signale une information obligatoire laissée vide', () => {
    const out = collectAnswers(asks, { champ1: null, champ2: 'x' })
    expect(out.missing).toEqual(['Ton numéro'])
    expect(out.answers).toEqual([])
  })

  it('accepte une réponse absente pour une information facultative', () => {
    const out = collectAnswers(asks, { champ1: '0612', champ2: null })
    expect(out.missing).toEqual([])
    expect(out.saved).toEqual([{ label: 'Ton numéro', value: '0612' }])
  })

  it('ne casse pas sur une charge utile inattendue', () => {
    expect(collectAnswers(asks, undefined).missing).toEqual(['Ton numéro'])
    expect(collectAnswers([], { champ1: 'x' })).toEqual({ answers: [], saved: [], phone: null, missing: [] })
  })
})

describe('hasUnnamedField', () => {
  it('repère un champ sans nom, que la lecture écarterait en silence', () => {
    expect(hasUnnamedField([{ label: 'Numéro de téléphone', kind: 'phone' }])).toBe(false)
    expect(hasUnnamedField([{ label: '   ', kind: 'phone' }])).toBe(true)
    expect(hasUnnamedField([])).toBe(false)
  })

  it('propose un nom pour le type téléphone, aucun pour la réponse libre', () => {
    expect(KIND_DEFAULT_LABEL.phone).toBe('Numéro de téléphone')
    expect(KIND_DEFAULT_LABEL.text).toBe('')
  })
})

describe('hasEmailField', () => {
  it('repère un champ qui redemande l’e-mail, déjà demandé à chaque réservation', () => {
    for (const label of ['Email', 'E-mail', 'Adresse mail', 'Ton e-mail', 'Courriel']) {
      expect(hasEmailField([{ label, kind: 'text' }])).toBe(true)
    }
    expect(hasEmailField([{ label: 'Prénom - Nom', kind: 'text' }])).toBe(false)
    expect(hasEmailField([{ label: 'Numéro de téléphone', kind: 'phone' }])).toBe(false)
    expect(hasEmailField([{ label: 'Gmail pro ou perso', kind: 'text' }])).toBe(false)
  })

  it('écarte ce champ à la lecture, comme sur le compte qui l’avait ajouté', () => {
    const fields: { kind: 'phone' | 'text'; label: string }[] = [
      { kind: 'phone', label: 'Numéro de téléphone' },
      { kind: 'text', label: 'Email' },
      { kind: 'text', label: 'Prénom - Nom' },
    ]
    expect(normalizeFields(fields).map((f) => f.label)).toEqual(['Numéro de téléphone', 'Prénom - Nom'])
    expect(buildAsks(normalizeIclose({ extra_fields: fields }).extra_fields, []).map((a) => a.label)).toEqual([
      'Numéro de téléphone',
      'Prénom - Nom',
    ])
  })
})
