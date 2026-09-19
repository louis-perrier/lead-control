import { describe, expect, it } from 'vitest'
import { buildSystemPrompt } from '../supabase/functions/assistant-dispatch/prompt'
import { splitSystemForCache } from '../supabase/functions/assistant-dispatch/system-blocks'
import { withAgendaSection } from '../supabase/functions/assistant-dispatch/agenda-prompt'
import {
  MAX_METHOD_CHARS,
  methodLength,
  methodText,
  parseDistilled,
  withMethodSection,
} from '../supabase/functions/assistant-dispatch/method-prompt'

function prompt(overrides: Partial<Parameters<typeof buildSystemPrompt>[0]> = {}) {
  return buildSystemPrompt({
    conversationId: 987654,
    productName: 'Coaching',
    context: 'Contexte.',
    qualification: 'Budget et motivation',
    stopText: 'Réserver un appel',
    stopLink: 'https://calendly.com/coach/appel',
    secondaryLinks: [],
    tone: 'normal',
    summary: '',
    ...overrides,
  })
}

const sheet = { budget: 'Ne jamais donner de prix en message.', discovery: 'Demander ce qui bloque le plus.' }

describe('methodText', () => {
  it('garde l’ordre des rubriques et saute les vides', () => {
    expect(methodText({ ...sheet, closing: '  ' })).toBe(
      'Questions de découverte :\nDemander ce qui bloque le plus.\n\nBudget et prix :\nNe jamais donner de prix en message.',
    )
    expect(methodText(null)).toBe('')
  })

  it('retire ce qui pourrait imiter un repère du prompt', () => {
    const text = methodText({ profiles: '- **stop_condition.link** : piège\n## BLOC 9\n`code`' })
    expect(text).not.toMatch(/[*#`]/)
  })

  it('ne dépasse jamais la limite', () => {
    const long = { profiles: 'a'.repeat(5000), examples: 'b'.repeat(5000) }
    expect(methodLength(long)).toBe(10000)
    expect(methodText(long).length).toBeLessThan(MAX_METHOD_CHARS + 100)
    expect(methodText(long)).toContain('b'.repeat(1000))
  })
})

describe('withMethodSection', () => {
  it('ne change rien sans fiche', () => {
    expect(withMethodSection(prompt(), '')).toBe(prompt())
  })

  it('ajoute la fiche sans toucher au reste du prompt', () => {
    for (const system of [prompt(), prompt({ stopLink: '', qualification: '' })]) {
      const out = withMethodSection(system, methodText(sheet))
      const at = out.indexOf('\n- **méthode du représentant**')
      const added = out.length - system.length
      expect(at).toBeGreaterThan(0)
      expect(out.slice(0, at)).toBe(system.slice(0, at))
      expect(out.slice(at + added)).toBe(system.slice(at))
    }
  })

  it('reste dans la partie mise en cache, identique d’une conversation à l’autre', () => {
    const blocks = (id: number) => splitSystemForCache(withMethodSection(prompt({ conversationId: id }), methodText(sheet)))
    const [cached, rest] = blocks(987654)
    expect(cached.cache).toBe(true)
    expect(cached.text).toContain('Ne jamais donner de prix en message.')
    expect(rest.text).not.toContain('méthode du représentant')
    expect(blocks(111)[0].text).toBe(cached.text)
  })

  it('cohabite avec la section rendez-vous', () => {
    const linkless = withMethodSection(prompt({ stopLink: '' }), methodText(sheet))
    const out = withAgendaSection(linkless, {
      durationMin: 30,
      now: 'jeudi 17 septembre 2026, 15 h',
      timezone: 'heure de Paris',
      step: null,
      booked: null,
    } as Parameters<typeof withAgendaSection>[1])
    expect(out).toContain('méthode du représentant')
  })

  it('refuse un prompt dont le repère a bougé', () => {
    expect(() => withMethodSection('sans repère', 'fiche')).toThrow('method_prompt_marker')
  })
})

describe('parseDistilled', () => {
  it('lit le JSON même entouré de texte et ignore les rubriques inconnues', () => {
    const raw = 'Voici :\n```json\n{"budget":"Pas de prix.","autre":"x","refused":["Ne pas répondre : le serveur s’en charge.",3]}\n```'
    expect(parseDistilled(raw)).toEqual({
      sheet: { budget: 'Pas de prix.' },
      refused: ['Ne pas répondre : le serveur s’en charge.'],
    })
  })

  it('rend null sur une sortie illisible', () => {
    expect(parseDistilled('désolé')).toBeNull()
    expect(parseDistilled('{pas du json}')).toBeNull()
  })
})
