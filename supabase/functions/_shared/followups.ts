import { admin } from './core.ts'

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

// Une relance incomplète est ignorée plutôt que bloquante : le client peut enregistrer
// un brouillon sans que l'assistant se mette à envoyer du vide.
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
    .sort((a, b) => Number(a.delay_minutes) - Number(b.delay_minutes))
    .slice(0, MAX_FOLLOWUPS)
}

export function pickVariant(item: FollowupItem): string | null {
  const variants = (item.variants ?? []).map((v) => (v ?? '').trim()).filter(Boolean)
  if (variants.length === 0) return null
  return variants[Math.floor(Math.random() * variants.length)]
}

// L'insertion passe par plan_followups : entre l'envoi de la réponse et ce point, le prospect
// a pu répondre, et seule la RPC voit la conversation verrouillée pour le vérifier.
export async function planFollowups(params: {
  conversationId: number
  assistantId: string | null
  anchorMessageId: number | null
  settings?: FollowupSettings | null
}) {
  const items = usableFollowupItems(params.settings)
  if (items.length === 0 || !params.assistantId || !params.anchorMessageId) return
  const slots = items.map((item, index) => ({
    slot: index + 1,
    delay_minutes: Number(item.delay_minutes),
  }))
  const { error } = await admin.rpc('plan_followups', {
    p_conversation_id: params.conversationId,
    p_assistant_id: params.assistantId,
    p_anchor_message_id: params.anchorMessageId,
    p_slots: slots,
  })
  if (error) throw new Error(`plan_followups: ${error.message}`)
}
