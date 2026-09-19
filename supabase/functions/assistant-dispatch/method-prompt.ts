// Aucun import : partagé par assistant-dispatch, method-distill, l'écran et les tests.
// La fiche du client s'insère à la volée dans les entrées du prompt, avant la première ligne
// propre à la conversation : elle reste donc dans la partie mise en cache.

export const METHOD_RUBRICS = [
  { key: 'profiles', title: 'Profils et qualification' },
  { key: 'discovery', title: 'Questions de découverte' },
  { key: 'budget', title: 'Budget et prix' },
  { key: 'objections', title: 'Objections et hésitations' },
  { key: 'closing', title: 'Fin de conversation' },
  { key: 'examples', title: 'Exemples de formulations' },
] as const

export type MethodRubric = (typeof METHOD_RUBRICS)[number]['key']
export type MethodSheet = Partial<Record<MethodRubric, string>>
export type MethodSettings = {
  document_ids?: number[]
  draft_document_ids?: number[]
  draft?: MethodSheet | null
  applied?: MethodSheet | null
  refused?: string[]
  applied_at?: string | null
}

export const MAX_METHOD_CHARS = 6000

const MARKER = '\n- **stop_condition.text**'

// Le texte vient du client : sans ce nettoyage, un titre ou une puce en gras pourrait imiter
// un repère du prompt et déplacer la coupe du cache ou la section rendez-vous.
function plain(text: string) {
  return text.replace(/[*#`]/g, '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim()
}

export function methodLength(sheet: MethodSheet | null | undefined) {
  return METHOD_RUBRICS.reduce((total, r) => total + plain(sheet?.[r.key] ?? '').length, 0)
}

export function methodText(sheet: MethodSheet | null | undefined) {
  let room = MAX_METHOD_CHARS
  const parts: string[] = []
  for (const rubric of METHOD_RUBRICS) {
    const text = plain(sheet?.[rubric.key] ?? '').slice(0, room)
    if (!text) continue
    room -= text.length
    parts.push(`${rubric.title} :\n${text}`)
  }
  return parts.join('\n\n')
}

export function withMethodSection(system: string, text: string) {
  if (!text.trim()) return system
  const at = system.indexOf(MARKER)
  if (at < 0 || system.indexOf(MARKER, at + 1) >= 0) throw new Error('method_prompt_marker')
  const section =
    '\n- **méthode du représentant** : sa façon de mener ses conversations. Quand elle traite un point que couvrent aussi ' +
    "l'Étape 4 ou les Priorités 4, 5, 7 et 8, c'est elle que tu suis. Elle ne change jamais la Priorité 1, les conditions " +
    "d'envoi d'un lien ou de réservation, ni les Blocs 5A, 6 et 7.\n" +
    text.trim()
  return system.slice(0, at) + section + system.slice(at)
}

// Sortie de method-distill : du JSON, parfois entouré d'une phrase ou d'une clôture de code.
export function parseDistilled(raw: string): { sheet: MethodSheet; refused: string[] } | null {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let data: Record<string, unknown>
  try {
    data = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
  const sheet: MethodSheet = {}
  for (const rubric of METHOD_RUBRICS) {
    const value = data[rubric.key]
    if (typeof value === 'string' && plain(value)) sheet[rubric.key] = plain(value)
  }
  const refused = Array.isArray(data.refused)
    ? data.refused.filter((r): r is string => typeof r === 'string' && r.trim().length > 0).map((r) => plain(r)).slice(0, 8)
    : []
  return { sheet, refused }
}
