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

import {
  DEFAULT_SEQUENCE,
  findStep,
  followupSteps,
  nextStep,
  notifyTemplates,
  pickVariant,
  stepsFromLegacy,
  usableSteps,
} from '../supabase/functions/_shared/followup-plan'
import { renderFollowupText } from '../supabase/functions/_shared/followup-text'

describe('stepsFromLegacy', () => {
  it('convertit la réserve et les relances en étapes aux délais cumulés', () => {
    const settings = {
      enabled: true,
      messages: [
        { id: 'm1', text: 'Un' },
        { id: 'm2', text: 'Deux' },
        { id: 'm3', text: 'Trois' },
      ],
      items: [
        { id: 'r1', delay_minutes: 120, kind: 'text' as const, pick: 'random' },
        { id: 'r2', delay_minutes: 60, kind: 'text' as const, pick: 'm2' },
        { id: 'r3', delay_minutes: 30, kind: 'audio' as const, media_path: 'x.wav', media_mime: 'audio/wav' },
      ],
      assisted: [{ id: 'h1', days: 3, text: 'Toujours partant {prénom} ?' }],
    }
    const steps = stepsFromLegacy(settings)
    expect(steps.map((s) => [s.id, s.kind, s.at_minutes])).toEqual([
      ['r1', 'message', 120],
      ['r2', 'message', 180],
      ['r3', 'message', 210],
      ['assisted-h1', 'notify', 4320],
    ])
    expect(steps[0].variants.map((v) => v.id)).toEqual(['m1', 'm3'])
    expect(steps[1].variants.map((v) => v.text)).toEqual(['Deux'])
    expect(steps[2].variants[0]).toMatchObject({ kind: 'audio', media_path: 'x.wav' })
    expect(steps[3].variants[0].text).toBe('Toujours partant {prénom} ?')
  })

  it('convertit aussi les réglages d’avant la réserve', () => {
    const steps = stepsFromLegacy({
      enabled: true,
      items: [
        { id: 'a', delay_minutes: 60, kind: 'text' as const, variants: ['Salut', 'Encore là ?'] },
        { id: 'b', delay_minutes: 60, kind: 'text' as const, variants: ['Salut'] },
      ],
    })
    expect(steps[0].variants.map((v) => v.text)).toEqual(['Encore là ?'])
    expect(steps[1].variants.map((v) => v.text)).toEqual(['Salut'])
    expect(steps[1].at_minutes).toBe(120)
  })

  it('lit les étapes telles quelles en version 3', () => {
    expect(followupSteps({ version: 3, steps: DEFAULT_SEQUENCE })).toBe(DEFAULT_SEQUENCE)
  })
})

describe('usableSteps', () => {
  const like = { id: 'l', at_minutes: 780, kind: 'like' as const, variants: [] }
  const ping = { id: 'p', at_minutes: 1380, kind: 'message' as const, variants: [{ id: 'p1', kind: 'text' as const, text: '{prénom|} ?' }] }
  const notify = { id: 'n', at_minutes: 2160, kind: 'notify' as const, variants: [{ id: 'n1', kind: 'text' as const, text: 'Hello' }] }

  it('trie par délai et respecte l’interrupteur', () => {
    expect(usableSteps({ enabled: true, version: 3, steps: [notify, ping, like] }).map((s) => s.id)).toEqual(['l', 'p', 'n'])
    expect(usableSteps({ enabled: false, version: 3, steps: [like] })).toEqual([])
  })

  it('écarte une étape hors bornes ou sans contenu', () => {
    const early = { ...notify, at_minutes: 1380 }
    const empty = { ...ping, id: 'e', variants: [{ id: 'e1', kind: 'text' as const, text: ' ' }] }
    const image = { ...ping, id: 'i', at_minutes: 900, variants: [{ id: 'i1', kind: 'image' as const }] }
    expect(usableSteps({ enabled: true, version: 3, steps: [early, empty, image, like] }).map((s) => s.id)).toEqual(['l'])
  })

  it('ne garde jamais deux étapes à moins de 15 minutes', () => {
    const close = { ...ping, id: 'c', at_minutes: 790 }
    expect(usableSteps({ enabled: true, version: 3, steps: [like, close, ping] }).map((s) => s.id)).toEqual(['l', 'p'])
  })

  it('accepte la séquence conseillée telle quelle', () => {
    expect(usableSteps({ enabled: true, version: 3, steps: DEFAULT_SEQUENCE })).toHaveLength(4)
    expect(renderFollowupText(DEFAULT_SEQUENCE[1].variants[0].text!, null)).toBe('?🙂')
    expect(renderFollowupText(DEFAULT_SEQUENCE[1].variants[0].text!, 'Léa')).toBe('Léa ?🙂')
  })
})

describe('enchaînement des étapes', () => {
  const steps = usableSteps({ enabled: true, version: 3, steps: DEFAULT_SEQUENCE })

  it('retrouve l’étape par son id et donne la suivante', () => {
    expect(findStep(steps, 'ping-23h', 1)?.kind).toBe('message')
    expect(nextStep(steps, 'ping-23h', 1)?.id).toBe('notify-36h')
    expect(nextStep(steps, 'notify-60h', 4)).toBeNull()
  })

  it('retombe sur la position pour les lignes sans id', () => {
    expect(findStep(steps, null, 1)?.id).toBe('like-13h')
    expect(findStep(steps, 'disparu', 1)).toBeNull()
  })
})

describe('pickVariant', () => {
  const step = {
    id: 's',
    at_minutes: 1380,
    kind: 'message' as const,
    variants: [
      { id: 'a', kind: 'text' as const, text: 'Hey {prénom}' },
      { id: 'b', kind: 'text' as const, text: 'Toujours là ?' },
      { id: 'c', kind: 'image' as const, media_path: 'meme.jpg' },
    ],
  }
  const render = (t: string) => t.replace('{prénom}', 'Léa')
  const draws = (sent: { variant_id?: string | null; text?: string | null }[]) =>
    new Set([0, 0.34, 0.67, 0.99].map((x) => pickVariant(step, sent, render, () => x)?.id))

  it('tire à parts égales parmi toutes les variantes', () => {
    expect(draws([])).toEqual(new Set(['a', 'b', 'c']))
  })

  it('écarte ce que le prospect a déjà reçu, par id ou par texte rendu', () => {
    expect(draws([{ variant_id: 'c' }])).toEqual(new Set(['a', 'b']))
    expect(draws([{ variant_id: null, text: 'Hey Léa' }, { variant_id: 'b', text: 'Toujours là ?' }])).toEqual(new Set(['c']))
  })

  it('repart sur tout sauf la dernière envoyée une fois tout reçu', () => {
    expect(draws([{ variant_id: 'a' }, { variant_id: 'c' }, { variant_id: 'b', text: 'Toujours là ?' }])).toEqual(new Set(['a', 'c']))
  })

  it('ne propose qu’un texte pour une étape de notification', () => {
    const notify = { ...step, kind: 'notify' as const }
    expect(new Set([0, 0.5, 0.99].map((x) => pickVariant(notify, [], render, () => x)?.id))).toEqual(new Set(['a', 'b']))
  })
})

describe('notifyTemplates', () => {
  it('donne un modèle par jour aux étapes de notification', () => {
    expect(notifyTemplates(DEFAULT_SEQUENCE).map((t) => [t.id, t.days])).toEqual([
      ['notify-36h', 2],
      ['notify-60h', 3],
    ])
  })
})
