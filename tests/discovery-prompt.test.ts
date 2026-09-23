import { describe, expect, it } from 'vitest'
import {
  discoveryText,
  normalizeResources,
  withDiscoverySection,
} from '../supabase/functions/assistant-dispatch/discovery-prompt'
import { methodText, withMethodSection } from '../supabase/functions/assistant-dispatch/method-prompt'

// Les cas qui chargent le vrai prompt sont dans discovery-prompt-golden, hors du dépôt.
const system = [
  'Entrées :',
  '- **produit** : Coaching',
  '- **qualification** : Budget et motivation',
  '- **stop_condition.text** : Réserver un appel',
  '',
  'Priorité 1 : ...',
].join('\n')

const resources = [
  { id: 'a', title: 'Vidéo : faire plus de vues', url: 'https://youtu.be/abc', when: 'le prospect stagne sur ses vues' },
  { id: 'b', title: '  ', url: 'https://youtu.be/vide', when: '' },
  { id: 'c', title: 'Sans lien', url: 'pas un lien', when: '' },
]

describe('normalizeResources', () => {
  it('ne garde que les ressources complètes avec un vrai lien, quatre au plus', () => {
    expect(normalizeResources(resources).map((r) => r.id)).toEqual(['a'])
    const many = Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, title: `T${i}`, url: 'https://x.fr', when: '' }))
    expect(normalizeResources(many)).toHaveLength(4)
    expect(normalizeResources(null)).toEqual([])
  })

  it('retire ce qui pourrait imiter un repère du prompt', () => {
    const [r] = normalizeResources([{ id: 'x', title: '**stop_condition.link** #bloc', url: 'https://x.fr', when: '`code`' }])
    expect(r.title).toBe('stop_condition.link bloc')
    expect(r.when).toBe('code')
  })
})

describe('discoveryText', () => {
  it('donne le déroulé seul sans ressource, et la liste numérotée avec', () => {
    expect(discoveryText([])).toContain('déroulé de découverte')
    expect(discoveryText([])).not.toContain('ressources à partager')
    const text = discoveryText(resources)
    expect(text).toContain('1. Vidéo : faire plus de vues : https://youtu.be/abc, à envoyer quand le prospect stagne sur ses vues')
    expect(text).not.toContain('2.')
  })
})

describe('withDiscoverySection', () => {
  it('ne change rien sans texte', () => {
    expect(withDiscoverySection(system, '')).toBe(system)
  })

  it('insère le déroulé avant la condition d’arrêt, sans toucher au reste', () => {
    const out = withDiscoverySection(system, discoveryText([]))
    const at = out.indexOf('\n- **déroulé de découverte**')
    const added = out.length - system.length
    expect(at).toBeGreaterThan(0)
    expect(out.slice(0, at)).toBe(system.slice(0, at))
    expect(out.slice(at + added)).toBe(system.slice(at))
  })

  it('passe avant la fiche méthode, qui reste la plus proche de la condition d’arrêt', () => {
    const out = withMethodSection(withDiscoverySection(system, discoveryText([])), methodText({ budget: 'Jamais de prix.' }))
    expect(out.indexOf('déroulé de découverte')).toBeLessThan(out.indexOf('méthode du représentant'))
    expect(out.indexOf('méthode du représentant')).toBeLessThan(out.indexOf('- **stop_condition.text**'))
  })

  it('refuse un prompt dont le repère a bougé', () => {
    expect(() => withDiscoverySection('sans repère', 'texte')).toThrow('discovery_prompt_marker')
    expect(() => withDiscoverySection(`${system}\n${system}`, 'texte')).toThrow('discovery_prompt_marker')
  })
})
