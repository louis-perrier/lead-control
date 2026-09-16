// Reconnaissance des réponses préenregistrées et texte soumis au petit modèle. Aucun import :
// le module sert aussi à l'écran de réglage et aux tests.

export type TriggerKind = 'keyword' | 'situation'
export type KeywordMatch = 'exact' | 'contains' | 'none'

const MAX_KEYWORD_WORDS = 4

const POLITENESS = new Set([
  'salut', 'slt', 'bonjour', 'bjr', 'bonsoir', 'hello', 'hey', 'coucou', 'cc', 'yo',
  'stp', 'svp', 'merci', 'please', 'pls',
])

export function normalizeWords(text: string): string[] {
  return text
    .replace(/œ/gi, 'oe')
    .replace(/æ/gi, 'ae')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

export function triggerKind(trigger: string): TriggerKind {
  const count = normalizeWords(trigger).length
  return count > 0 && count <= MAX_KEYWORD_WORDS && !trigger.includes('?') ? 'keyword' : 'situation'
}

function singular(word: string) {
  return word.length > 3 && /[sx]$/.test(word) ? word.slice(0, -1) : word
}

// Distance de Damerau restreinte : « vidoe » est à une faute de « video », pas à deux.
function editDistance(a: string, b: string) {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
    }
  }
  return d[a.length][b.length]
}

// Les mots courts doivent être exacts : « ia » et « ai » ne sont pas la même chose.
export function sameWord(a: string, b: string) {
  if (a === b) return true
  const sa = singular(a)
  const sb = singular(b)
  if (sa === sb) return true
  return a.length >= 5 && b.length >= 5 && editDistance(sa, sb) <= 1
}

// Les marqueurs [Vocal] ou [Photo] ajoutés à la transcription ne font pas partie du message.
function messageWords(message: string) {
  return normalizeWords(message.replace(/^\s*\[[^\]]*\]\s*/, ''))
}

export function isOnlyPoliteness(message: string) {
  return messageWords(message).every((w) => POLITENESS.has(w))
}

export function matchKeyword(message: string, trigger: string): KeywordMatch {
  const target = normalizeWords(trigger)
  const words = messageWords(message)
  if (target.length === 0 || words.length === 0) return 'none'
  const core = words.filter((w) => !POLITENESS.has(w) || target.includes(w))
  if (core.length === target.length && core.every((w, i) => sameWord(w, target[i]))) return 'exact'
  for (let start = 0; start + target.length <= words.length; start++) {
    if (target.every((w, i) => sameWord(words[start + i], w))) return 'contains'
  }
  return 'none'
}

export function bestKeywordMatch<T extends { trigger?: string }>(
  message: string,
  entries: T[],
): { entry: T; match: 'exact' | 'contains' } | null {
  let best: { entry: T; match: 'exact' | 'contains'; size: number } | null = null
  for (const entry of entries) {
    const trigger = entry.trigger ?? ''
    if (triggerKind(trigger) !== 'keyword') continue
    const match = matchKeyword(message, trigger)
    if (match === 'none') continue
    const size = normalizeWords(trigger).join(' ').length
    const better =
      !best ||
      (match === 'exact' && best.match === 'contains') ||
      (match === best.match && size > best.size)
    if (better) best = { entry, match, size }
  }
  return best ? { entry: best.entry, match: best.match } : null
}

export type CannedDescription = {
  trigger?: string
  moment?: string
  kind?: 'text' | 'audio'
  text?: string
  transcript?: string
}

function momentOf(entry: CannedDescription) {
  return (entry.moment ?? '').trim()
}

// Sans transcription, le modèle ne peut pas juger si le vocal colle à la conversation.
export function cannedPreview(entry: CannedDescription) {
  if (entry.kind !== 'audio') return (entry.text ?? '').slice(0, 300)
  const transcript = (entry.transcript ?? '').trim()
  return transcript ? `(message vocal) ${transcript.slice(0, 600)}` : '(message vocal)'
}

// Un moment précisé oblige à relire la conversation, même quand le mot-clé est seul.
export function sendsWithoutCheck(hit: { entry: CannedDescription; match: 'exact' | 'contains' }) {
  return hit.match === 'exact' && !momentOf(hit.entry)
}

export function keywordCheckInput(entry: CannedDescription) {
  const moment = momentOf(entry)
  return `Mot-clé : ${entry.trigger}\n${moment ? `Moment : ${moment}\n` : ''}Réponse préenregistrée : ${cannedPreview(entry)}`
}

export function situationList(entries: CannedDescription[]) {
  return entries
    .map((e, i) => {
      const moment = momentOf(e)
      return `${i + 1}. ${e.trigger}\n${moment ? `   Moment : ${moment}\n` : ''}   Réponse associée : ${cannedPreview(e)}`
    })
    .join('\n')
}

// Le petit modèle ajoute parfois une explication après son JSON : seul le premier objet compte.
export function firstJsonObject(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[^{}]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}
