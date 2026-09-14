import { describe, expect, it } from 'vitest'
import {
  cumulativeOffsets,
  findFollowupItem,
  nextFollowupItem,
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
