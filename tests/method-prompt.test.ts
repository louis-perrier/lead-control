import { describe, expect, it } from 'vitest'
import {
  MAX_METHOD_CHARS,
  methodLength,
  methodText,
  parseDistilled,
  withMethodSection,
} from '../supabase/functions/assistant-dispatch/method-prompt'

// Les cas qui chargent le vrai prompt sont dans method-prompt-golden, hors du dépôt.
const system = [
  'Entrées :',
  '- **produit** : Coaching',
  '- **qualification** : Budget et motivation',
  '- **stop_condition.text** : Réserver un appel',
  '',
  'Priorité 1 : ...',
].join('\n')

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
    expect(withMethodSection(system, '')).toBe(system)
    expect(withMethodSection(system, '   ')).toBe(system)
  })

  it('ajoute la fiche sans toucher au reste', () => {
    const out = withMethodSection(system, methodText(sheet))
    const at = out.indexOf('\n- **méthode du représentant**')
    const added = out.length - system.length
    expect(at).toBeGreaterThan(0)
    expect(out.slice(0, at)).toBe(system.slice(0, at))
    expect(out.slice(at + added)).toBe(system.slice(at))
    expect(out).toContain('Ne jamais donner de prix en message.')
  })

  it('refuse un prompt dont le repère a bougé', () => {
    expect(() => withMethodSection('sans repère', 'fiche')).toThrow('method_prompt_marker')
    expect(() => withMethodSection(`${system}\n${system}`, 'fiche')).toThrow('method_prompt_marker')
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
