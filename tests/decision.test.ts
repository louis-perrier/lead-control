import { describe, expect, it } from 'vitest'
import { linkBase, parseDecision, stopConfirmed } from '../supabase/functions/assistant-dispatch/decision'

describe('parseDecision', () => {
  it('lit un JSON complet', () => {
    const { readable, decision } = parseDecision(
      '{"reply_text": "Salut", "should_response": true, "stop_successful": false, "should_notify_human": false, "heat_tag": "warm", "heat_reason": "intéressé", "summary": "Coach débutant"}',
    )
    expect(readable).toBe(true)
    expect(decision.reply_text).toBe('Salut')
    expect(decision.heat_tag).toBe('warm')
    expect(decision.summary).toBe('Coach débutant')
  })

  it('répare les sauts de ligne bruts entre deux bulles', () => {
    const { readable, decision } = parseDecision('```json\n{"reply_text": "Bulle 1\n\nBulle 2", "should_response": true}\n```')
    expect(readable).toBe(true)
    expect(decision.reply_text).toBe('Bulle 1\n\nBulle 2')
  })

  it('garde la température connue quand la sortie est coupée', () => {
    const { readable, decision } = parseDecision('{"reply_text": "Je te réponds", "should_response": true, "heat_tag": "wa')
    expect(readable).toBe(false)
    expect(decision.reply_text).toBe('Je te réponds')
    expect(decision.heat_tag).toBeNull()
    expect(decision.summary).toBeNull()
  })

  it('escalade une sortie vide au lieu de se taire', () => {
    const { readable, decision } = parseDecision('')
    expect(readable).toBe(false)
    expect(decision.should_response).toBe(false)
    expect(decision.should_notify_human).toBe(true)
  })

  it('n’envoie jamais un JSON cassé sans reply_text', () => {
    const { decision } = parseDecision('{"should_response": true, "reply_te')
    expect(decision.reply_text).toBeNull()
    expect(decision.should_notify_human).toBe(true)
  })
})

describe('stopConfirmed', () => {
  const link = 'https://calendly.com/coach/appel?utm_source=ig'

  it('garde le comportement actuel sans lien principal', () => {
    expect(stopConfirmed({ stopSuccessful: true, stopLink: '', linkSent: false, hasBooking: false })).toBe(true)
  })

  it('refuse l’objectif quand le lien principal n’est jamais parti', () => {
    expect(stopConfirmed({ stopSuccessful: true, stopLink: link, linkSent: false, hasBooking: false })).toBe(false)
  })

  it('accepte sur envoi du lien ou rendez-vous pris', () => {
    expect(stopConfirmed({ stopSuccessful: true, stopLink: link, linkSent: true, hasBooking: false })).toBe(true)
    expect(stopConfirmed({ stopSuccessful: true, stopLink: link, linkSent: false, hasBooking: true })).toBe(true)
  })

  it('ne fabrique jamais un objectif que le modèle n’a pas déclaré', () => {
    expect(stopConfirmed({ stopSuccessful: false, stopLink: '', linkSent: true, hasBooking: true })).toBe(false)
  })

  it('compare le lien sans ses paramètres', () => {
    expect(linkBase(link)).toBe('https://calendly.com/coach/appel')
    expect(linkBase(' https://skool.com/groupe/ ')).toBe('https://skool.com/groupe')
  })
})
