// Aucun import : testé sous Vitest. Le modèle propose un geste, ce module décide s'il part :
// un like ou une citation mal placés se remarquent plus que leur absence.

type Message = { id: number; author_type: string }

export const MAX_CITES = 2

export const LIKE_RULE =
  '- **like** : les messages du prospect restés sans réponse portent un numéro entre crochets quand il y en a plusieurs. ' +
  "Si l'un d'eux est avant tout un compliment ou de l'admiration pour toi ou ton contenu, ajoute à ton JSON \"like\" avec " +
  "son numéro, 1 s'il est seul. Jamais sur un message qui porte aussi une objection, un refus ou un souci. Dans le doute, " +
  "n'ajoute rien."

export const CITE_RULE =
  '- **citation** : quand ces messages numérotés portent des sujets différents, tu peux rattacher une bulle au message ' +
  'auquel elle répond : ajoute à ton JSON "cite", une liste qui donne pour chaque bulle, dans l\'ordre, le numéro du ' +
  'message cité ou null. Seulement pour séparer deux sujets : un seul sujet, ou une bulle qui répond à tout, ne cite rien.'

// Les messages du prospect restés sans réponse, dans l'ordre : ce sont eux que le modèle voit numérotés.
export function burstOf<T extends Message>(messages: T[]): T[] {
  let start = messages.length
  while (start > 0 && messages[start - 1].author_type === 'customer') start -= 1
  return messages.slice(start)
}

// Un seul message ne se numérote pas : la transcription reste alors celle d'avant.
export function burstNumbers(messages: Message[]): Map<number, number> {
  const burst = burstOf(messages)
  if (burst.length < 2) return new Map()
  return new Map(burst.map((m, i) => [m.id, i + 1]))
}

export function likeTarget(burst: Message[], like: number | null | undefined): number | null {
  if (!like || burst.length === 0) return null
  if (burst.length === 1) return burst[0].id
  return burst[like - 1]?.id ?? null
}

// Une entrée par bulle envoyée, null quand elle ne cite rien. `origins` vient du découpage :
// le rang de la bulle du modèle, absent pour une suite de phrase.
export function citeTargets(burst: Message[], cite: (number | null)[] | undefined, origins: (number | undefined)[]): (number | null)[] {
  const none = origins.map(() => null)
  if (!cite || burst.length < 2) return none
  let used = 0
  return origins.map((origin, i) => {
    const n = origin === undefined ? null : cite[origin]
    if (!n || n < 1 || n > burst.length || used >= MAX_CITES) return null
    // Citer son dernier message en ouverture ne sépare rien : la réponse le suit déjà.
    if (i === 0 && n === burst.length) return null
    used += 1
    return burst[n - 1].id
  })
}
