import { describe, expect, it } from 'vitest'
import { bookingHost } from '../supabase/functions/_shared/booking-settings'

describe('bookingHost', () => {
  it('vaut le compte lui-même par défaut, ou sans libellé', () => {
    expect(bookingHost(undefined)).toEqual({ who: 'me', label: '' })
    expect(bookingHost({ who: 'other', label: '  ' })).toEqual({ who: 'me', label: '' })
    expect(bookingHost({ who: 'me', label: 'Marceau' })).toEqual({ who: 'me', label: '' })
  })

  it('garde le libellé d’une autre personne, coupé à 40 caractères', () => {
    expect(bookingHost({ who: 'other', label: ' Marceau, mon associé ' })).toEqual({ who: 'other', label: 'Marceau, mon associé' })
    expect(bookingHost({ who: 'other', label: 'x'.repeat(60) }).label).toHaveLength(40)
  })
})
