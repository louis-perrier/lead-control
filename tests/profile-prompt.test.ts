import { describe, expect, it } from 'vitest'
import { followerLabel, profileNote } from '../supabase/functions/assistant-dispatch/profile-prompt'

describe('followerLabel', () => {
  it('rounds down like a person reading the profile', () => {
    expect(followerLabel(12_600)).toBe('12K')
    expect(followerLabel(12_999)).toBe('12K')
    expect(followerLabel(4_560)).toBe('4,5K')
    expect(followerLabel(1_000)).toBe('1K')
    expect(followerLabel(999_999)).toBe('999K')
    expect(followerLabel(1_234_567)).toBe('1,2M')
    expect(followerLabel(12_345_678)).toBe('12M')
  })

  it('keeps small accounts vague', () => {
    expect(followerLabel(0)).toBe('moins de 100')
    expect(followerLabel(99)).toBe('moins de 100')
    expect(followerLabel(847)).toBe('environ 800')
    expect(followerLabel(860)).toBe('environ 900')
    expect(followerLabel(960)).toBe('1K')
  })
})

describe('profileNote', () => {
  it('stays empty without a usable count', () => {
    expect(profileNote(undefined)).toBe('')
    expect(profileNote(null)).toBe('')
    expect(profileNote(Number.NaN)).toBe('')
    expect(profileNote(-3)).toBe('')
  })

  it('never hands the exact figure to the model', () => {
    const note = profileNote(12_634)
    expect(note).toContain('12K abonnés')
    expect(note).not.toMatch(/12\s?634/)
  })
})
