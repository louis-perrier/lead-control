import { describe, expect, it } from 'vitest'
import { burstNumbers, burstOf, citeTargets, likeTarget } from '../supabase/functions/assistant-dispatch/gestures'
import { splitReplyPieces } from '../supabase/functions/assistant-dispatch/bubbles'
import { parseDecision } from '../supabase/functions/assistant-dispatch/decision'

const msg = (id: number, author_type: string) => ({ id, author_type })
const thread = [msg(1, 'customer'), msg(2, 'agent'), msg(3, 'customer'), msg(4, 'customer'), msg(5, 'customer')]
const burst = burstOf(thread)

describe('burst', () => {
  it('keeps only what the prospect sent since our last message', () => {
    expect(burst.map((m) => m.id)).toEqual([3, 4, 5])
    expect(burstOf([...thread, msg(6, 'human')])).toEqual([])
  })

  it('numbers nothing when a single message waits', () => {
    expect([...burstNumbers(thread)]).toEqual([[3, 1], [4, 2], [5, 3]])
    expect(burstNumbers([msg(1, 'agent'), msg(2, 'customer')]).size).toBe(0)
  })
})

describe('likeTarget', () => {
  it('follows the number, or the only message', () => {
    expect(likeTarget(burst, 2)).toBe(4)
    expect(likeTarget([msg(9, 'customer')], 1)).toBe(9)
    expect(likeTarget([msg(9, 'customer')], 4)).toBe(9)
  })

  it('does nothing on a wrong or missing number', () => {
    expect(likeTarget(burst, null)).toBeNull()
    expect(likeTarget(burst, 0)).toBeNull()
    expect(likeTarget(burst, 7)).toBeNull()
    expect(likeTarget([], 1)).toBeNull()
  })
})

describe('citeTargets', () => {
  it('ties each bubble to the message it answers', () => {
    expect(citeTargets(burst, [1, 3], [0, 1])).toEqual([3, 5])
    expect(citeTargets(burst, [null, 2], [0, 1])).toEqual([null, 4])
  })

  it('never opens by quoting the last message', () => {
    expect(citeTargets(burst, [3], [0])).toEqual([null])
    expect(citeTargets(burst, [3, 1], [0, 1])).toEqual([null, 3])
  })

  it('drops what cannot be trusted', () => {
    expect(citeTargets(burst, undefined, [0, 1])).toEqual([null, null])
    expect(citeTargets(burst, [9, 0], [0, 1])).toEqual([null, null])
    expect(citeTargets([msg(9, 'customer')], [1], [0])).toEqual([null])
    expect(citeTargets(burst, [1, 2, 1], [0, 1, 2])).toEqual([3, 4, null])
  })

  it('quotes only the start of a bubble the server split', () => {
    const long = `${'Alors pour ta première question, voilà ce que je peux te dire. '.repeat(4)}`.trim()
    const pieces = splitReplyPieces(`${long}\n\nEt pour le reste on voit ça ensemble`, () => 1)
    const origins = pieces.map((p) => p.origin)
    expect(origins).toEqual([0, undefined, 1])
    expect(citeTargets(burst, [1, 2], origins)).toEqual([3, null, 4])
  })
})

describe('parseDecision', () => {
  it('reads the optional gestures and ignores junk', () => {
    const ok = parseDecision('{"reply_text":"a\\n\\nb","like":2,"cite":[1,null,"x"]}').decision
    expect(ok.like).toBe(2)
    expect(ok.cite).toEqual([1, null, null])
    const bare = parseDecision('{"reply_text":"a"}').decision
    expect(bare.like).toBeNull()
    expect(bare.cite).toEqual([])
    expect(parseDecision('{"reply_text":"a","like":true,"cite":"1"}').decision).toMatchObject({ like: 1, cite: [] })
  })
})
