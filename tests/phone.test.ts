import { describe, expect, it } from 'vitest'
import { toE164 } from '../supabase/functions/_shared/phone'

describe('toE164', () => {
  it('ramène un numéro français au format international', () => {
    expect(toE164('0651468062', 'Europe/Paris')).toBe('+33651468062')
    expect(toE164('06 51 46 80 62', 'Europe/Paris')).toBe('+33651468062')
    expect(toE164('06.51.46.80.62', 'Europe/Paris')).toBe('+33651468062')
  })

  it('garde un numéro déjà international', () => {
    expect(toE164('+33 6 51 46 80 62', 'Europe/Paris')).toBe('+33651468062')
    expect(toE164('0033651468062', 'Europe/Paris')).toBe('+33651468062')
    expect(toE164('+237 677 12 34 56', 'Europe/Paris')).toBe('+237677123456')
  })

  it('suit le fuseau du compte pour l’indicatif', () => {
    expect(toE164('0470123456', 'Europe/Brussels')).toBe('+32470123456')
  })

  it('renonce plutôt que deviner', () => {
    expect(toE164('677123456', 'Europe/Paris')).toBeNull()
    expect(toE164('0651468062', 'Asia/Tokyo')).toBeNull()
    expect(toE164('06', 'Europe/Paris')).toBeNull()
    expect(toE164('', 'Europe/Paris')).toBeNull()
    expect(toE164(null, 'Europe/Paris')).toBeNull()
  })
})
