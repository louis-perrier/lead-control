// Aucun import : partagé par followups-dispatch, l'écran de réglage et les tests.

export type FollowupItem = {
  id?: string
  delay_minutes?: number
  kind?: 'text' | 'audio'
  variants?: string[]
  media_path?: string
  media_mime?: string
}

export type FollowupSettings = {
  enabled?: boolean
  after_own_message?: boolean
  items?: FollowupItem[]
}

export const MAX_FOLLOWUPS = 3
export const MIN_DELAY_MINUTES = 15
export const MAX_DELAY_MINUTES = 23 * 60 + 45
export const MESSAGING_WINDOW_MINUTES = 24 * 60

// Une relance incomplète est ignorée plutôt que bloquante : le client peut enregistrer
// un brouillon sans que l'assistant se mette à envoyer du vide. L'ordre de saisie compte :
// chaque délai part de la relance précédente.
export function usableFollowupItems(settings?: FollowupSettings | null): FollowupItem[] {
  if (!settings?.enabled) return []
  const items = Array.isArray(settings.items) ? settings.items : []
  return items
    .filter((item) => {
      const delay = Number(item?.delay_minutes)
      if (!Number.isFinite(delay) || delay < MIN_DELAY_MINUTES || delay > MAX_DELAY_MINUTES) return false
      if (item.kind === 'audio') return Boolean(item.media_path)
      return (item.variants ?? []).some((v) => typeof v === 'string' && v.trim().length > 0)
    })
    .slice(0, MAX_FOLLOWUPS)
}

export function pickVariant(item: FollowupItem): string | null {
  const variants = (item.variants ?? []).map((v) => (v ?? '').trim()).filter(Boolean)
  if (variants.length === 0) return null
  return variants[Math.floor(Math.random() * variants.length)]
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
