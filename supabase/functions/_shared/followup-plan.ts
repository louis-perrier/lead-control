// Aucun import : partagé par followups-dispatch, l'écran de réglage et les tests.

export type FollowupItem = {
  id?: string
  delay_minutes?: number
  kind?: 'text' | 'audio'
  variants?: string[]
  pick?: string
  media_path?: string
  media_mime?: string
  transcript?: string
}

export type FollowupMessage = { id: string; text: string }

export type FollowupSettings = {
  enabled?: boolean
  after_own_message?: boolean
  messages?: FollowupMessage[]
  items?: FollowupItem[]
}

export const MAX_FOLLOWUPS = 3
export const MAX_POOL = 4
export const PICK_RANDOM = 'random'
export const MIN_DELAY_MINUTES = 15
export const MAX_DELAY_MINUTES = 23 * 60 + 45
export const MESSAGING_WINDOW_MINUTES = 24 * 60

// Un brouillon incomplet est ignoré sans bloquer. L'ordre de saisie compte : chaque délai
// part de la relance précédente, la liste n'est donc jamais triée.
export function usableFollowupItems(settings?: FollowupSettings | null): FollowupItem[] {
  if (!settings?.enabled) return []
  const items = Array.isArray(settings.items) ? settings.items : []
  const pool = followupPool(settings)
  return items
    .filter((item) => {
      const delay = Number(item?.delay_minutes)
      if (!Number.isFinite(delay) || delay < MIN_DELAY_MINUTES || delay > MAX_DELAY_MINUTES) return false
      if (item.kind === 'audio') return Boolean(item.media_path)
      if (pool) return pool.length > 0
      return (item.variants ?? []).some((v) => typeof v === 'string' && v.trim().length > 0)
    })
    .slice(0, MAX_FOLLOWUPS)
}

// null : réglages d'avant la réserve commune, chaque relance garde alors ses propres variantes.
export function followupPool(settings?: FollowupSettings | null): FollowupMessage[] | null {
  if (!Array.isArray(settings?.messages)) return null
  return settings.messages
    .filter((m) => m && typeof m.id === 'string' && typeof m.text === 'string' && m.text.trim().length > 0)
    .map((m) => ({ id: m.id, text: m.text.trim() }))
}

// Anciens réglages ouverts dans l'écran : les variantes de toutes les relances forment la
// réserve, et une relance qui n'avait qu'un texte reste fixée dessus.
export function poolFromVariants(items: FollowupItem[]) {
  const messages: FollowupMessage[] = []
  const idOf = (text: string) => {
    const found = messages.find((m) => m.text === text)
    if (found) return found.id
    messages.push({ id: `m${messages.length + 1}`, text })
    return messages[messages.length - 1].id
  }
  const picks = items.map((item) => {
    const ids = (item.variants ?? []).map((v) => (v ?? '').trim()).filter(Boolean).map(idOf)
    return ids.length === 1 ? ids[0] : PICK_RANDOM
  })
  return { messages, picks }
}

// Le message fixé sur une relance, s'il existe encore dans la réserve.
export function fixedMessage(pool: FollowupMessage[], item: FollowupItem) {
  if (item.kind === 'audio' || !item.pick || item.pick === PICK_RANDOM) return null
  return pool.find((m) => m.id === item.pick) ?? null
}

// sent : textes déjà partis en relance dans cette conversation, du plus ancien au plus récent,
// tels qu'envoyés. render applique le prénom pour comparer à armes égales.
export function pickMessage(
  settings: FollowupSettings | null | undefined,
  item: FollowupItem,
  sent: string[] = [],
  render: (text: string) => string = (t) => t,
  rand: () => number = Math.random,
): string | null {
  const pool = followupPool(settings)
  const texts = pool
    ? pool.map((m) => m.text)
    : (item.variants ?? []).map((v) => (v ?? '').trim()).filter(Boolean)
  if (texts.length === 0) return null

  let candidates = texts
  if (pool) {
    const fixed = fixedMessage(pool, item)
    if (fixed) return fixed.text
    const taken = new Set(
      (settings?.items ?? []).filter((other) => other !== item && !(item.id && other.id === item.id)).map((other) => fixedMessage(pool, other)?.text),
    )
    const free = texts.filter((t) => !taken.has(t))
    if (free.length > 0) candidates = free
  }

  const seen = new Set(sent.map((t) => t.trim()))
  const last = sent.length ? sent[sent.length - 1].trim() : null
  const unseen = candidates.filter((t) => !seen.has(render(t).trim()))
  const notLast = candidates.filter((t) => render(t).trim() !== last)
  const from = unseen.length ? unseen : notLast.length ? notLast : candidates
  return from[Math.floor(rand() * from.length)]
}

// Retrouve la relance par son id : modifier ou réordonner ses relances ne doit pas faire
// partir le texte d'une autre. Les lignes planifiées avant l'id retombent sur la position.
export function findFollowupItem(items: FollowupItem[], itemId: string | null, slotIndex: number) {
  if (itemId) return items.find((item) => item.id === itemId) ?? null
  return items[slotIndex - 1] ?? null
}

export function nextFollowupItem(items: FollowupItem[], itemId: string | null, slotIndex: number) {
  const current = findFollowupItem(items, itemId, slotIndex)
  const position = current ? items.indexOf(current) : slotIndex - 1
  return items[position + 1] ?? null
}

// Minutes écoulées depuis notre dernier message au départ de chaque relance.
export function cumulativeOffsets(delays: number[]) {
  let total = 0
  return delays.map((delay) => (total += Math.max(0, Number(delay) || 0)))
}
