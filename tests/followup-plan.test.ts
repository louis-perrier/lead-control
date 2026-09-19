import { describe, expect, it } from 'vitest'
import {
  cumulativeOffsets,
  findFollowupItem,
  nextFollowupItem,
  pickMessage,
  poolFromVariants,
  usableFollowupItems,
} from '../supabase/functions/_shared/followup-plan'

const items = [
  { id: 'a', delay_minutes: 120, kind: 'text' as const, variants: ['Relance A'] },
  { id: 'b', delay_minutes: 60, kind: 'text' as const, variants: ['Relance B'] },
  { id: 'c', delay_minutes: 480, kind: 'audio' as const, media_path: 'x.wav' },
]

describe('usableFollowupItems', () => {
  it('garde l’ordre de saisie, les délais étant relatifs', () => {
    expect(usableFollowupItems({ enabled: true, items }).map((i) => i.id)).toEqual(['a', 'b', 'c'])
  })

  it('écarte les brouillons et respecte l’interrupteur', () => {
    const drafts = [{ id: 'x', delay_minutes: 120, kind: 'text' as const, variants: [' '] }, ...items]
    expect(usableFollowupItems({ enabled: true, items: drafts }).map((i) => i.id)).toEqual(['a', 'b', 'c'])
    expect(usableFollowupItems({ enabled: false, items })).toEqual([])
  })
})

describe('enchaînement', () => {
  it('retrouve la relance par son id même si l’ordre a changé', () => {
    expect(findFollowupItem(items, 'b', 1)?.id).toBe('b')
    expect(nextFollowupItem(items, 'b', 1)?.id).toBe('c')
  })

  it('retombe sur la position pour les lignes sans id', () => {
    expect(findFollowupItem(items, null, 2)?.id).toBe('b')
    expect(nextFollowupItem(items, null, 3)).toBeNull()
  })

  it('ne planifie rien après une relance supprimée', () => {
    expect(findFollowupItem(items, 'z', 1)).toBeNull()
  })

  it('cumule les délais pour la frise', () => {
    expect(cumulativeOffsets([120, 240, 480])).toEqual([120, 360, 840])
  })
})

describe('pickMessage', () => {
  const messages = [
    { id: 'm1', text: 'Un' },
    { id: 'm2', text: 'Deux' },
    { id: 'm3', text: 'Trois' },
    { id: 'm4', text: 'Quatre' },
  ]
  const r1 = { id: 'r1', delay_minutes: 60, kind: 'text' as const, pick: 'random' }
  const r2 = { id: 'r2', delay_minutes: 60, kind: 'text' as const, pick: 'm2' }
  const r3 = { id: 'r3', delay_minutes: 60, kind: 'text' as const, pick: 'random' }
  const settings = { enabled: true, messages, items: [r1, r2, r3] }
  const draws = (item: typeof r1, sent: string[]) =>
    new Set([0, 0.26, 0.51, 0.76, 0.99].map((x) => pickMessage(settings, item, sent, (t) => t, () => x)))

  it('envoie le message fixé, même déjà reçu', () => {
    expect(pickMessage(settings, r2, ['Deux'])).toBe('Deux')
  })

  it('ne tire jamais au hasard un message fixé sur une autre relance', () => {
    expect(draws(r1, [])).toEqual(new Set(['Un', 'Trois', 'Quatre']))
  })

  it('écarte ce que le prospect a déjà reçu', () => {
    expect(draws(r3, ['Un', 'Deux'])).toEqual(new Set(['Trois', 'Quatre']))
    expect(draws(r3, ['Un', 'Deux', 'Trois'])).toEqual(new Set(['Quatre']))
  })

  it('repart sur toute la réserve une fois épuisée, sans répéter le dernier envoi', () => {
    expect(draws(r1, ['Un', 'Trois', 'Quatre'])).toEqual(new Set(['Un', 'Trois']))
  })

  it('compare les textes une fois le prénom posé', () => {
    const named = { enabled: true, messages: [{ id: 'a', text: 'Hey {prénom}' }, { id: 'b', text: 'Toujours là ?' }], items: [r1] }
    const render = (t: string) => t.replace('{prénom}', 'Léa')
    expect(pickMessage(named, r1, ['Hey Léa'], render, () => 0)).toBe('Toujours là ?')
  })

  it('revient au hasard quand le message fixé a été supprimé', () => {
    const gone = { ...settings, items: [{ ...r2, pick: 'supprimé' }] }
    expect(pickMessage(gone, gone.items[0], [], (t) => t, () => 0)).toBe('Un')
  })

  it('garde les variantes par relance des anciens réglages, avec la même mémoire', () => {
    const legacy = { id: 'x', delay_minutes: 60, kind: 'text' as const, variants: ['A', 'B'] }
    const old = { enabled: true, items: [legacy] }
    expect(usableFollowupItems(old)).toHaveLength(1)
    expect(pickMessage(old, legacy, ['A'], (t) => t, () => 0)).toBe('B')
    expect(pickMessage(old, legacy, ['A', 'B'], (t) => t, () => 0)).toBe('A')
  })

  it('ne garde aucune relance texte quand la réserve est vide', () => {
    expect(usableFollowupItems({ enabled: true, messages: [{ id: 'm', text: ' ' }], items: [r1] })).toEqual([])
  })
})

describe('poolFromVariants', () => {
  it('réunit les variantes sans doublon et garde fixée une relance à un seul texte', () => {
    const { messages, picks } = poolFromVariants([
      { id: 'a', kind: 'text', variants: ['Salut', ' Encore là ? '] },
      { id: 'b', kind: 'text', variants: ['Salut'] },
      { id: 'c', kind: 'audio', media_path: 'x.wav' },
    ])
    expect(messages).toEqual([{ id: 'm1', text: 'Salut' }, { id: 'm2', text: 'Encore là ?' }])
    expect(picks).toEqual(['random', 'm1', 'random'])
  })
})
