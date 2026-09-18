import { describe, expect, it } from 'vitest'
import { bookingChoice, type BookingMode } from '@/lib/booking-mode'

const two: BookingMode[] = ['calendly', 'iclose']
const three: BookingMode[] = ['calendly', 'iclose', 'calendar']

describe('bookingChoice', () => {
  it('démarre sur le lien quand rien n’est enregistré', () => {
    const c = bookingChoice(undefined, two, [], null, null)
    expect(c.mode).toBe('link')
    expect(c.linked).toEqual([])
  })

  it('propose les connexions quand l’assistant est choisi sans outil relié', () => {
    const c = bookingChoice(undefined, two, [], true, null)
    expect(c.byAgent).toBe(true)
    expect(c.linked).toEqual([])
    expect(c.mode).toBe('calendly')
  })

  it('suit l’outil relié sans rien demander', () => {
    const c = bookingChoice('calendly', two, ['calendly'], null, null)
    expect(c.byAgent).toBe(true)
    expect(c.mode).toBe('calendly')
    expect(c.linked).toEqual(['calendly'])
  })

  it('bascule sur le seul outil relié quand le mode enregistré ne l’est plus', () => {
    const c = bookingChoice('calendly', two, ['iclose'], null, null)
    expect(c.mode).toBe('iclose')
  })

  it('laisse choisir entre deux comptes hérités, le mode enregistré en premier', () => {
    const c = bookingChoice('calendar', three, ['calendly', 'calendar'], null, null)
    expect(c.linked).toEqual(['calendly', 'calendar'])
    expect(c.mode).toBe('calendar')
    expect(bookingChoice('calendar', three, ['calendly', 'calendar'], null, 'calendly').mode).toBe('calendly')
  })

  it('ignore un outil choisi qui vient d’être déconnecté', () => {
    const c = bookingChoice('calendly', three, ['calendly'], null, 'calendar')
    expect(c.mode).toBe('calendly')
  })

  it('revient aux connexions quand le compte est déconnecté', () => {
    const c = bookingChoice('calendly', two, [], null, null)
    expect(c.byAgent).toBe(true)
    expect(c.linked).toEqual([])
  })

  it('suit le réglage enregistré tant que les comptes n’ont pas chargé', () => {
    const c = bookingChoice('iclose', two, null, null, null)
    expect(c.linked).toEqual(['iclose'])
    expect(c.mode).toBe('iclose')
  })

  it('reste sur le lien quand aucun module de réservation n’est ouvert', () => {
    const c = bookingChoice('calendly', [], ['calendly'], true, null)
    expect(c.byAgent).toBe(false)
    expect(c.mode).toBe('link')
  })

  it('ignore un mode enregistré dont le module est fermé', () => {
    const c = bookingChoice('calendar', two, ['calendly'], null, null)
    expect(c.byAgent).toBe(false)
    expect(c.mode).toBe('link')
  })

  it('revient au lien sur demande, même avec un outil relié', () => {
    const c = bookingChoice('calendly', two, ['calendly'], false, null)
    expect(c.mode).toBe('link')
  })
})
