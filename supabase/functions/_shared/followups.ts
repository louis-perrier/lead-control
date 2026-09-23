import { admin } from './core.ts'
import { audienceBlocks } from './audience.ts'
import { isFarewell } from '../assistant-dispatch/closing.ts'
import { usableSteps } from './followup-plan.ts'
import type { FollowupSettings, FollowupStep } from './followup-plan.ts'

export {
  MAX_DELAY_MINUTES,
  MAX_STEPS,
  MIN_DELAY_MINUTES,
  findStep,
  nextStep,
  notifyTemplates,
  pickVariant,
  usableSteps,
} from './followup-plan.ts'
export type { FollowupSettings, FollowupStep, FollowupVariant, SentVariant } from './followup-plan.ts'

// L'insertion passe par plan_followups : entre l'envoi de la réponse et ce point, le prospect
// a pu répondre, et seule la RPC voit la conversation verrouillée pour le vérifier.
// L'ancre reste notre dernier message pour toute la séquence : at_minutes est cumulé.
export async function planFollowupSlot(params: {
  conversationId: number
  assistantId: string
  anchorMessageId: number
  slot: number
  step: FollowupStep
}) {
  const { error } = await admin.rpc('plan_followups', {
    p_conversation_id: params.conversationId,
    p_assistant_id: params.assistantId,
    p_anchor_message_id: params.anchorMessageId,
    p_slots: [{ slot: params.slot, delay_minutes: Number(params.step.at_minutes), item_id: params.step.id }],
  })
  if (error) throw new Error(`plan_followups: ${error.message}`)
}

// Un prospect qui a réservé (Calendly ou Google) n'est plus relancé, même si le compte lui répond.
export async function conversationHasBooking(conversationId: number) {
  const { data } = await admin
    .from('bookings')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('status', 'active')
    .limit(1)
  return (data?.length ?? 0) > 0
}

// Seule la première étape est planifiée : la suivante l'est au moment où celle-ci part
// vraiment, sinon deux étapes reportées hors horaires partaient à la même ouverture.
// Le filtre d'audience se vérifie ici, un message écrit à la main à un compte exclu en programmait une.
export async function planFollowups(params: {
  conversationId: number
  assistantId: string | null
  anchorMessageId: number | null
  assistantSettings: Record<string, unknown> | null | undefined
  contactHandle: string | null | undefined
  anchorText: string | null | undefined
}) {
  const settings = params.assistantSettings ?? null
  if (audienceBlocks(settings, params.contactHandle ?? null)) return
  if (isFarewell(params.anchorText)) return
  const [first] = usableSteps((settings as { followups?: FollowupSettings } | null)?.followups)
  if (!first || !params.assistantId || !params.anchorMessageId) return
  if (await conversationHasBooking(params.conversationId)) return
  await planFollowupSlot({
    conversationId: params.conversationId,
    assistantId: params.assistantId,
    anchorMessageId: params.anchorMessageId,
    slot: 1,
    step: first,
  })
}
