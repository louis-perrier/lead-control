import { describe, expect, it } from 'vitest'
import { buildSystemPrompt } from '../supabase/functions/assistant-dispatch/prompt'
import { splitSystemForCache } from '../supabase/functions/assistant-dispatch/system-blocks'

function prompt(overrides: Partial<Parameters<typeof buildSystemPrompt>[0]> = {}) {
  return buildSystemPrompt({
    conversationId: 987654,
    productName: 'Coaching',
    context: 'Contexte du coach.\n\n### Document\nTexte du document.',
    qualification: 'Budget et motivation',
    stopText: 'Réserver un appel',
    stopLink: 'https://calendly.com/coach/appel',
    secondaryLinks: [{ condition: 'Pas de budget', link: 'https://skool.com/groupe' }],
    tone: 'normal',
    summary: 'Résumé du prospect',
    ...overrides,
  })
}

describe('splitSystemForCache', () => {
  it('ne modifie pas un caractère du prompt', () => {
    for (const system of [prompt(), prompt({ stopLink: '', secondaryLinks: [], summary: '' })]) {
      const blocks = splitSystemForCache(system)
      expect(blocks.map((b) => b.text).join('')).toBe(system)
    }
  })

  it('ne met en cache que ce qui est commun à toutes les conversations', () => {
    for (const system of [prompt(), prompt({ stopLink: '' })]) {
      const [cached, rest] = splitSystemForCache(system)
      expect(cached.cache).toBe(true)
      expect(rest.cache).toBe(false)
      expect(cached.text).not.toContain('987654')
      expect(cached.text).toContain('Texte du document.')
      expect(rest.text).toContain('987654')
    }
  })

  it('envoie le prompt entier sans cache quand aucun repère n’est trouvé', () => {
    expect(splitSystemForCache('texte libre')).toEqual([{ text: 'texte libre', cache: false }])
  })
})
