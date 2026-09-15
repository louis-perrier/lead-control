// Fin d'échange : quand le compte a déjà conclu et que le prospect ne fait que remercier ou
// saluer, un like remplace une nouvelle réponse. Sans cela l'agent reprend la parole à chaque
// « merci » et donne l'impression de vouloir le dernier mot. Le prompt n'intervient pas ici.
// Aucun import : le module est testé sous Vitest, hors du runtime Deno.

function normalizeWords(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

export const CLOSING_MAX_CHARS = 80

type Message = { id: number; author_type: string; message_type: string; body_text: string | null; send_state?: string | null }

// Formules par lesquelles le dernier message du compte disait déjà au revoir. Un lien envoyé
// n'en fait pas partie : après le lien, le « bon courage, à bientôt » de l'agent reste bienvenu.
const FAREWELLS = [
  'a bientot', 'a plus tard', 'a tres vite', 'au plaisir', 'bonne journee', 'bonne soiree', 'bonne nuit',
  'bonne continuation', 'bonne chance', 'bon courage', 'prends soin', 'prenez soin', 'hesite pas',
  'je reste dispo', 'bon week', 'bonne fin',
]
// « Avec plaisir » seul conclut une réponse à un merci, pas un message qui accompagne un lien.
const THANKS_REPLIES = ['avec plaisir', 'de rien']

// Aucune négation ni mot de relance : « pas compris » ou « et toi » doivent passer par une vraie réponse.
const CLOSING_WORDS = new Set([
  'merci', 'mercii', 'thanks', 'thx', 'beaucoup', 'bcp', 'encore', 'une', 'fois', 'pour', 'tout', 'ton', 'ta',
  'tes', 'votre', 'vos', 'aide', 'conseil', 'conseils', 'ok', 'oki', 'okay', 'okk', 'dac', 'daccord', 'd', 'accord',
  'ca', 'marche', 'top', 'super', 'parfait', 'nickel', 'genial', 'cool', 'yes', 'oui', 'ouais', 'yep', 'bien',
  'recu', 'compris', 'note', 'entendu', 'vu', 'tkt', 't', 'inquiete', 'a', 'bientot', 'plus', 'tres', 'vite',
  'au', 'revoir', 'bye', 'ciao', 'tchao', 'bisous', 'bonne', 'bon', 'journee', 'soiree', 'nuit', 'week', 'end',
  'weekend', 'continuation', 'courage', 'toi', 'vous', 'aussi', 'pareil', 'de', 'rien', 'plaisir', 'avec', 'frere',
  'frerot', 'bro', 'mec', 'gars', 'boss', 'chef', 'grave', 'vraiment', 'trop', 'je', 'te', 'remercie', 'c', 'est',
  'gentil', 'sympa', 'j', 'ai',
])

// Un « ok » seul peut aussi vouloir dire « continue » : sans remerciement ni au revoir, on confirme.
const THANKS_OR_BYE = new Set([
  'merci', 'mercii', 'thanks', 'thx', 'remercie', 'bientot', 'revoir', 'bye', 'ciao', 'tchao', 'bisous', 'plaisir',
  'journee', 'soiree', 'nuit', 'weekend', 'continuation', 'courage',
])

const POSITIVE_EMOJI = new Set([
  '🙏', '👍', '❤', '♥', '😊', '🙂', '😁', '😄', '😀', '🔥', '💪', '👌', '🤝', '🥰', '😍', '🫶', '✅', '💯', '🙌',
  '👏', '😉', '🤗', '💙', '🧡', '💛', '💚', '💜', '🖤', '🤍',
])

export type ClosingCheck = {
  verdict: 'like' | 'ask'
  accountTurn: string
  prospectReply: string
  targetId: number
}

// Sert aussi aux relances : relancer « au cas où tu n'aurais pas vu » après un au revoir sonne faux.
export function isFarewell(text: string | null | undefined) {
  if (!text?.trim() || text.includes('?')) return false
  const normalized = ` ${normalizeWords(text).join(' ')} `
  const has = (markers: string[]) => markers.some((marker) => normalized.includes(` ${marker} `))
  return has(FAREWELLS) || (has(THANKS_REPLIES) && !/https?:\/\//i.test(text))
}

// 'like' : politesse pure, sans appel IA. 'ask' : court mais à confirmer. null : on répond.
export function closingCheck(messages: Message[]): ClosingCheck | null {
  const sorted = [...messages].filter((m) => m.send_state !== 'failed').sort((a, b) => a.id - b.id)
  let end = sorted.length
  while (end > 0 && sorted[end - 1].author_type === 'customer') end--
  const tail = sorted.slice(end)
  if (tail.length === 0) return null
  let start = end
  while (start > 0 && sorted[start - 1].author_type !== 'customer') start--
  const turn = sorted.slice(start, end)
  if (turn.length === 0) return null
  if ([...tail, ...turn].some((m) => m.message_type !== 'text' || !m.body_text?.trim())) return null

  const accountTurn = turn.map((m) => m.body_text!.trim()).join('\n')
  const prospectReply = tail.map((m) => m.body_text!.trim()).join('\n')
  if (!isFarewell(accountTurn)) return null
  if (prospectReply.includes('?') || prospectReply.length > CLOSING_MAX_CHARS) return null

  const words = normalizeWords(prospectReply)
  const emojis = prospectReply.match(/\p{Extended_Pictographic}/gu) ?? []
  if (words.length === 0 && emojis.length === 0) return null
  const pure =
    words.every((w) => CLOSING_WORDS.has(w)) &&
    emojis.every((e) => POSITIVE_EMOJI.has(e)) &&
    (words.some((w) => THANKS_OR_BYE.has(w)) || emojis.length > 0)
  return { verdict: pure ? 'like' : 'ask', accountTurn, prospectReply, targetId: tail[tail.length - 1].id }
}
