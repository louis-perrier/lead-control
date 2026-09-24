import { describe, expect, it } from 'vitest'
import { daysSince } from '../lib/utils'

const now = new Date('2026-09-24T10:00:00Z')

describe('daysSince', () => {
  it('vaut 0 le jour même', () => {
    expect(daysSince('2026-09-24T08:00:00Z', now)).toBe(0)
  })

  it('compte des jours entiers', () => {
    expect(daysSince('2026-09-23T09:00:00Z', now)).toBe(1)
    expect(daysSince('2026-08-26T12:00:00Z', now)).toBe(28)
  })

  it('ne descend jamais sous zéro', () => {
    expect(daysSince('2026-10-01T00:00:00Z', now)).toBe(0)
  })
})
