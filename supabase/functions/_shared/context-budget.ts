// Partagé par l'agent et par l'écran des documents : l'écran affiche ce que l'agent lit
// vraiment. Aucun import, le fichier est aussi compilé par Next et Vitest.

export const CONTEXT_DOCS_BUDGET = 40_000

// Part de caractères attribuée à chaque document, dans l'ordre reçu. Les petits passent
// en entier, la place restante est partagée à parts égales entre les plus longs.
export function allocateBudget(lengths: number[], budget = CONTEXT_DOCS_BUDGET): number[] {
  const caps = lengths.map(() => 0)
  const order = lengths.map((length, index) => ({ length: Math.max(0, length), index }))
  order.sort((a, b) => a.length - b.length)
  let remaining = budget
  for (let i = 0; i < order.length; i += 1) {
    const share = Math.floor(remaining / (order.length - i))
    const { length, index } = order[i]
    const cap = Math.min(length, share)
    caps[index] = cap
    remaining -= cap
  }
  return caps
}

// Coupe en fin de paragraphe, à défaut en fin de phrase, pour ne pas laisser l'agent
// sur une idée tronquée. On ne remonte jamais sous 60 % de la part.
export function cutAtBoundary(text: string, cap: number) {
  if (text.length <= cap) return text
  const slice = text.slice(0, cap)
  const floor = Math.floor(cap * 0.6)
  const paragraph = slice.lastIndexOf('\n\n')
  if (paragraph >= floor) return slice.slice(0, paragraph).trimEnd()
  const sentence = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '), slice.lastIndexOf('.\n'))
  if (sentence >= floor) return slice.slice(0, sentence + 1).trimEnd()
  const line = slice.lastIndexOf('\n')
  if (line >= floor) return slice.slice(0, line).trimEnd()
  return slice.trimEnd()
}

export type DocReadShare = { complete: boolean; percent: number }

// sourceLength est la longueur du fichier avant la coupe d'import, quand elle est connue.
export function readShares(docs: { length: number; sourceLength?: number | null }[], budget = CONTEXT_DOCS_BUDGET): DocReadShare[] {
  const caps = allocateBudget(docs.map((d) => d.length), budget)
  return docs.map((d, i) => {
    const source = Math.max(d.length, d.sourceLength ?? 0)
    const read = Math.min(caps[i], d.length)
    if (source === 0) return { complete: true, percent: 100 }
    const complete = read >= source
    return { complete, percent: complete ? 100 : Math.min(99, Math.floor((read / source) * 100)) }
  })
}
