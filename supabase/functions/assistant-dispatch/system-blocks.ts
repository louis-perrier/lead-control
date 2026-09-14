// Aucun import : testé sous Vitest. Le texte du prompt n'est jamais modifié, il est
// seulement coupé en deux pour que sa partie commune à toutes les conversations d'un
// assistant soit mise en cache chez Anthropic.

export type SystemBlock = { text: string; cache: boolean }

// Première ligne propre à une conversation : le lien principal porte son identifiant.
// Sans lien principal, la ligne qui suit directement sert de repère.
const CONVERSATION_MARKERS = ['- **stop_condition.link**', 'Un message OPÉRATEUR est envoyé manuellement']

export function splitSystemForCache(system: string): SystemBlock[] {
  const found = CONVERSATION_MARKERS.map((marker) => system.indexOf(`\n${marker}`)).filter((at) => at > 0)
  if (found.length === 0) return [{ text: system, cache: false }]
  const at = Math.min(...found)
  return [
    { text: system.slice(0, at + 1), cache: true },
    { text: system.slice(at + 1), cache: false },
  ]
}
