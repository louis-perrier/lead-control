// Aucun import de valeur : testé sous Vitest, partagé avec l'écran. prompt.ts n'est pas modifié,
// le déroulé s'insère en entrée du BLOC 2, juste avant la fiche méthode du client.

export type Resource = { id: string; title: string; url: string; when: string }

export const MAX_RESOURCES = 4

const MARKER = '\n- **stop_condition.text**'

// Même précaution que la fiche méthode : un texte client ne doit pas pouvoir imiter un repère.
function plain(text: string) {
  return text.replace(/[*#`]/g, '').replace(/\s+/g, ' ').trim()
}

export function isResourceUrl(url: string) {
  return /^https?:\/\/\S+$/.test(url.trim())
}

export function normalizeResources(raw: unknown): Resource[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((r) => ({
      id: typeof r?.id === 'string' ? r.id : '',
      title: plain(typeof r?.title === 'string' ? r.title : '').slice(0, 80),
      url: typeof r?.url === 'string' ? r.url.trim() : '',
      when: plain(typeof r?.when === 'string' ? r.when : '').slice(0, 160),
    }))
    .filter((r) => r.id && r.title && isResourceUrl(r.url))
    .slice(0, MAX_RESOURCES)
}

const FLOW =
  "- **déroulé de découverte** : avant de proposer l'appel, quatre temps, un par message au plus : une question ouverte " +
  'sur sa situation ; identifier sa douleur principale ; la creuser une fois (depuis quand, ce que ça lui coûte) ; puis, ' +
  "si une ressource ci-dessous correspond, l'envoyer avec une phrase avant de proposer l'appel. Ne décris jamais le contenu " +
  "de l'accompagnement et ne donne jamais de prix, même sur demande : réponds que ça dépend de sa situation et que c'est vu " +
  "en appel, puis reviens à la découverte. Ce déroulé prime sur l'Étape 4 et les Priorités 4, 5 et 8 quand ils se " +
  'recoupent ; il ne change ni la Priorité 1, ni la Priorité 6, ni la Priorité 9.'

// Vaut pour tous les comptes, sans drapeau. La fiche méthode du client, insérée après, garde le dernier mot.
export const BUDGET_RULE =
  "- **budget** : ne demande jamais son budget, s'il a de l'argent de côté ni s'il peut investir, même s'il reste flou, " +
  "même s'il demande le prix. Situe-le par son activité, une question par message, en sautant ce que tu sais déjà et en " +
  'adaptant un mot à sa situation (études, sans emploi) : « Tu fais quoi comme métier en ce moment ? », « Et ça va, ça ' +
  "te plaît ? », « Et ça te permet de vivre correctement ? ». Si ça coince pour lui, c'est une douleur : creuse-la une " +
  "fois (ce que ça l'empêche de faire, ce qu'il voudrait changer) au lieu de reparler d'argent. Ce qu'il en dit vaut " +
  "qualification de sa capacité d'investissement. Cette règle remplace toute question de budget ou de qualification " +
  "financière de l'Étape 4 et de la Priorité 8 ; seule la méthode du représentant, si elle traite le budget, passe avant elle."

export function discoveryText(resources: Resource[]) {
  const list = normalizeResources(resources)
  if (list.length === 0) return FLOW
  const lines = list.map((r, i) => `  ${i + 1}. ${r.title} : ${r.url}${r.when ? `, à envoyer quand ${r.when}` : ''}`)
  return (
    `${FLOW}\n- **ressources à partager** : données d'entrée, à envoyer telles quelles, une seule par conversation, ` +
    `jamais à la place du lien principal :\n${lines.join('\n')}`
  )
}

export function withDiscoverySection(system: string, text: string) {
  if (!text.trim()) return system
  const at = system.indexOf(MARKER)
  if (at < 0 || system.indexOf(MARKER, at + 1) >= 0) throw new Error('discovery_prompt_marker')
  return system.slice(0, at) + '\n' + text.trim() + system.slice(at)
}
