// Découpage d'une réponse en bulles Instagram. Aucun import : le module est testé sous Vitest.
// Le texte n'est jamais réécrit, seuls les points de coupure changent (et la virgule qui
// précède un mot de liaison quand on coupe dessus).

export const LONG_BUBBLE = 180
export const MAX_BUBBLES = 3
export const QUESTION_SPLIT_RATE = 0.8
const FIRST_TYPING_MS = 1500
const MAX_TOTAL_TYPING_MS = 10_000

export type Piece = { text: string; sep: string }
type Cut = { at: number; end: number }

const HAS_LETTER = /\p{L}/u
const SENTENCE_END = /(?:[.!?…]|\p{Extended_Pictographic}️?)$/u
const CONNECTOR = /,(\s+)(?=(?:mais|donc|parce que|du coup|sauf que|par contre|alors que)(?!\p{L})|(?:parce|sauf|alors) qu['’])/giu
const ENDS_WITH_QUESTION = /\?[\s\p{Extended_Pictographic}️]*$/u

function sentenceCuts(text: string): Cut[] {
  const cuts: Cut[] = []
  for (const m of text.matchAll(/\s+/g)) {
    const at = m.index!
    if (at === 0) continue
    if (m[0].includes('\n') || SENTENCE_END.test(text.slice(0, at))) cuts.push({ at, end: at + m[0].length })
  }
  return cuts
}

function connectorCuts(text: string): Cut[] {
  return [...text.matchAll(CONNECTOR)].map((m) => ({ at: m.index!, end: m.index! + m[0].length }))
}

function usable(text: string, cut: Cut) {
  return HAS_LETTER.test(text.slice(0, cut.at)) && HAS_LETTER.test(text.slice(cut.end))
}

function cutPiece(piece: Piece, cut: Cut): [Piece, Piece] {
  return [
    { text: piece.text.slice(0, cut.at), sep: piece.sep },
    { text: piece.text.slice(cut.end), sep: piece.text.slice(cut.at, cut.end) },
  ]
}

function splitLong(piece: Piece): Piece[] {
  if (piece.text.length <= LONG_BUBBLE) return [piece]
  const middle = piece.text.length / 2
  const nearest = (cuts: Cut[]) =>
    cuts
      .filter((c) => usable(piece.text, c))
      .sort((a, b) => Math.abs(a.at - middle) - Math.abs(b.at - middle))[0]
  const cut = nearest(sentenceCuts(piece.text)) ?? nearest(connectorCuts(piece.text))
  if (!cut) return [piece]
  const [head, tail] = cutPiece(piece, cut)
  return [...splitLong(head), ...splitLong(tail)]
}

function splitQuestion(piece: Piece): Piece[] {
  if (!ENDS_WITH_QUESTION.test(piece.text)) return [piece]
  const cuts = sentenceCuts(piece.text).filter((c) => usable(piece.text, c))
  const last = cuts[cuts.length - 1]
  return last ? cutPiece(piece, last) : [piece]
}

function mergeShortest(pieces: Piece[]): Piece[] {
  const result = [...pieces]
  while (result.length > MAX_BUBBLES) {
    let best = 1
    for (let i = 2; i < result.length; i++) {
      if (result[i - 1].text.length + result[i].text.length < result[best - 1].text.length + result[best].text.length) best = i
    }
    const [a, b] = [result[best - 1], result[best]]
    result.splice(best - 1, 2, { text: a.text + b.sep + b.text, sep: a.sep })
  }
  return result
}

export function splitReplyPieces(text: string, random: () => number = Math.random): Piece[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  const parts = trimmed.split(/(\s*\n[ \t]*\n\s*)/)
  let pieces: Piece[] = []
  for (let i = 0; i < parts.length; i += 2) {
    pieces.push({ text: parts[i], sep: i === 0 ? '' : parts[i - 1] })
  }
  if (random() < QUESTION_SPLIT_RATE) {
    pieces = [...pieces.slice(0, -1), ...splitQuestion(pieces[pieces.length - 1])]
  }
  pieces = pieces.flatMap(splitLong)
  return mergeShortest(pieces)
}

export function splitReply(text: string, random: () => number = Math.random): string[] {
  return splitReplyPieces(text, random).map((p) => p.text)
}

// Pause « en train d'écrire » avant chaque bulle. Le total reste borné : la fonction traite
// plusieurs conversations à la suite dans une durée d'exécution limitée.
export function typingPauses(bubbles: string[]): number[] {
  let budget = MAX_TOTAL_TYPING_MS
  return bubbles.map((bubble, i) => {
    const wanted = i === 0 ? FIRST_TYPING_MS : Math.min(7000, Math.max(2000, 1000 + 40 * bubble.length))
    const pause = Math.max(0, Math.min(wanted, budget))
    budget -= pause
    return pause
  })
}
