import { admin } from './core.ts'
import { audienceBlocks } from './audience.ts'
import { usableFollowupItems } from './followup-plan.ts'
import type { FollowupItem, FollowupSettings } from './followup-plan.ts'

export {
  MAX_DELAY_MINUTES,
  MAX_FOLLOWUPS,
  MIN_DELAY_MINUTES,
  findFollowupItem,
  nextFollowupItem,
  pickVariant,
  usableFollowupItems,
} from './followup-plan.ts'
export type { FollowupItem, FollowupSettings } from './followup-plan.ts'

// L'insertion passe par plan_followups : entre l'envoi de la réponse et ce point, le prospect
// a pu répondre, et seule la RPC voit la conversation verrouillée pour le vérifier.
export async function planFollowupSlot(params: {
  conversationId: number
  assistantId: string
  anchorMessageId: number
  slot: number
  item: FollowupItem
}) {
  const { error } = await admin.rpc('plan_followups', {
    p_conversation_id: params.conversationId,
    p_assistant_id: params.assistantId,
    p_anchor_message_id: params.anchorMessageId,
    p_slots: [{ slot: params.slot, delay_minutes: Number(params.item.delay_minutes), item_id: params.item.id ?? null }],
  })
  if (error) throw new Error(`plan_followups: ${error.message}`)
}

// Seule la première relance est planifiée : la suivante l'est au moment où celle-ci part
// vraiment, sinon deux relances reportées hors horaires partaient à la même ouverture.
// Le filtre d'audience se vérifie ici, un message écrit à la main à un compte exclu en programmait une.
export async function planFollowups(params: {
  conversationId: number
  assistantId: string | null
  anchorMessageId: number | null
  assistantSettings: Record<string, unknown> | null | undefined
  contactHandle: string | null | undefined
}) {
  const settings = params.assistantSettings ?? null
  if (audienceBlocks(settings, params.contactHandle ?? null)) return
  const [first] = usableFollowupItems((settings as { followups?: FollowupSettings } | null)?.followups)
  if (!first || !params.assistantId || !params.anchorMessageId) return
  await planFollowupSlot({
    conversationId: params.conversationId,
    assistantId: params.assistantId,
    anchorMessageId: params.anchorMessageId,
    slot: 1,
    item: first,
  })
}
