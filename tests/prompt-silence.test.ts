import { describe, expect, it } from 'vitest'
import { buildSystemPrompt } from '../supabase/functions/assistant-dispatch/prompt'

const system = buildSystemPrompt({
  conversationId: 1,
  productName: 'Offre',
  context: 'Contexte.',
  qualification: '',
  stopText: 'Réserver un appel',
  stopLink: 'https://calendly.com/exemple/appel',
  secondaryLinks: [],
  tone: 'normal',
  summary: '',
})

describe('prompt de l’agent', () => {
  it('ne laisse plus à l’agent le choix de se taire', () => {
    expect(system).not.toContain('Non-réponse')
    expect(system).not.toContain('ne pas répondre est le bon choix')
  })

  it('garde la règle de réponse, le style et les exemples', () => {
    expect(system).toContain('Si le dernier message est du prospect, toujours répondre, même brièvement.')
    expect(system).toContain('## BLOC 5A — CONTRAINTES FIXES DE STYLE')
    expect(system).toContain('Exemple A, Setter, partage de situation.')
    expect(system).toContain('Escalade humaine :')
  })
})
