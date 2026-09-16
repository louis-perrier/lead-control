import { describe, expect, it } from 'vitest'
import { formatCurrency, initialsOf, storageSafeName } from '@/lib/utils'

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

describe('storageSafeName', () => {
  it('nettoie le nom réel qui bloquait l’import', () => {
    expect(storageSafeName('Lead control - Savoir le budget du prospect et bien l’amener vers l’appel.txt')).toBe(
      'Lead-control-Savoir-le-budget-du-prospect-et-bien-l-amener-vers-l-appel.txt',
    )
  })

  it('retire les accents et garde l’extension', () => {
    expect(storageSafeName('Présentation de l’offre été.MD')).toBe('Presentation-de-l-offre-ete.md')
  })

  it('ne renvoie jamais un nom vide', () => {
    expect(storageSafeName('’’’.txt')).toBe('document.txt')
    expect(storageSafeName('🙂')).toBe('document')
  })
})
