import { describe, expect, it } from 'vitest'
import { readSolicitorVerdict, shouldCheckSolicitor, solicitorInput } from '../supabase/functions/assistant-dispatch/solicitor'

const inbound = { author_type: 'customer', body_text: 'Bonjour, je propose du montage vidéo' }

describe('shouldCheckSolicitor', () => {
  it('ne vérifie que si le réglage est actif', () => {
    expect(shouldCheckSolicitor(true, {}, [inbound])).toBe(true)
    expect(shouldCheckSolicitor(undefined, {}, [inbound])).toBe(false)
  })

  it('ne vérifie plus une fois que le compte a écrit', () => {
    expect(shouldCheckSolicitor(true, {}, [{ author_type: 'agent', body_text: 'Salut' }, inbound])).toBe(false)
    expect(shouldCheckSolicitor(true, {}, [{ author_type: 'human', body_text: 'Salut' }, inbound])).toBe(false)
  })

  it('ne vérifie qu’une fois par conversation', () => {
    expect(shouldCheckSolicitor(true, { solicitor_checked: true }, [inbound])).toBe(false)
  })
})

describe('lecture', () => {
  it('réunit les messages, vocaux transcrits compris', () => {
    expect(solicitorInput([inbound, { author_type: 'customer', body_text: null, transcript: 'mon offre' }])).toBe(
      'Bonjour, je propose du montage vidéo\nmon offre',
    )
  })

  it('ne retient qu’un oui explicite', () => {
    expect(readSolicitorVerdict('{"demarchage": true}')).toBe(true)
    expect(readSolicitorVerdict('{"demarchage":false}')).toBe(false)
    expect(readSolicitorVerdict('je ne sais pas')).toBe(false)
  })
})
