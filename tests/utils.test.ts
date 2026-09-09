import { describe, expect, it } from 'vitest'
import { formatCurrency, initialsOf } from '@/lib/utils'

describe('initialsOf', () => {
  it('prend les initiales du nom', () => {
    expect(initialsOf('Louis Perrier')).toBe('LP')
  })
  it('fonctionne avec un email', () => {
    expect(initialsOf('louis.perrier@example.com')).toBe('LP')
  })
  it('gère les valeurs vides', () => {
    expect(initialsOf(null)).toBe('?')
  })
})

describe('formatCurrency', () => {
  it('formate en euros sans décimales', () => {
    expect(formatCurrency(700)).toContain('700')
    expect(formatCurrency(700)).toContain('€')
  })
  it('gère null', () => {
    expect(formatCurrency(null)).toContain('0')
  })
})
