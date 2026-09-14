import { describe, expect, it } from 'vitest'
import { allocateBudget, cutAtBoundary, readShares } from '../supabase/functions/_shared/context-budget'

describe('allocateBudget', () => {
  it('donne tout quand les documents tiennent dans la place', () => {
    expect(allocateBudget([5773, 6815, 3175, 2719, 9667])).toEqual([5773, 6815, 3175, 2719, 9667])
  })

  it('garde les petits entiers et partage le reste entre les longs', () => {
    const caps = allocateBudget([2000, 30000, 30000], 20000)
    expect(caps[0]).toBe(2000)
    expect(caps[1]).toBe(9000)
    expect(caps[2]).toBe(9000)
  })

  it('ne dépasse jamais la place disponible', () => {
    const caps = allocateBudget([40000, 40000, 40000, 1000])
    expect(caps.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(40000)
    expect(caps[3]).toBe(1000)
  })
})

describe('cutAtBoundary', () => {
  it('rend le texte intact quand il tient', () => {
    expect(cutAtBoundary('Bonjour.', 100)).toBe('Bonjour.')
  })

  it('coupe en fin de paragraphe', () => {
    const text = `${'a'.repeat(70)}\n\n${'b'.repeat(60)}`
    expect(cutAtBoundary(text, 100)).toBe('a'.repeat(70))
  })

  it('coupe en fin de phrase à défaut de paragraphe', () => {
    const text = `${'a'.repeat(70)}. ${'b'.repeat(60)}`
    expect(cutAtBoundary(text, 100)).toBe(`${'a'.repeat(70)}.`)
  })
})

describe('readShares', () => {
  it('marque lu en entier ce qui tient', () => {
    expect(readShares([{ length: 5000 }, { length: 3000 }])).toEqual([
      { complete: true, percent: 100 },
      { complete: true, percent: 100 },
    ])
  })

  it('signale un document coupé à l’import même s’il tient dans la place', () => {
    expect(readShares([{ length: 40000, sourceLength: 80000 }])).toEqual([{ complete: false, percent: 50 }])
  })

  it('donne la part lue d’un document raccourci', () => {
    const [share] = readShares([{ length: 60000 }])
    expect(share.complete).toBe(false)
    expect(share.percent).toBe(66)
  })
})
