import type { Conversation } from './types'
import { needsManualFollowup } from '@/supabase/functions/_shared/messaging-window'
import { BOOKED_REASONS } from '@/supabase/functions/_shared/booking-settings'

export type ProspectStage = 'new' | 'talking' | 'qualified' | 'unqualified' | 'booked' | 'won' | 'lost'

// Ordre d'affichage des pastilles, du début à la fin du parcours.
export const PROSPECT_STAGES: { key: ProspectStage; label: string; plural: string }[] = [
  { key: 'new', label: 'Nouveau', plural: 'Nouveaux' },
  { key: 'talking', label: 'En discussion', plural: 'En discussion' },
  { key: 'qualified', label: 'Qualifié', plural: 'Qualifiés' },
  { key: 'booked', label: 'Rendez-vous', plural: 'Rendez-vous' },
  { key: 'won', label: 'Gagné', plural: 'Gagnés' },
  { key: 'lost', label: 'Perdu', plural: 'Perdus' },
  { key: 'unqualified', label: 'Non qualifié', plural: 'Non qualifiés' },
]

type StageInput = Pick<
  Conversation,
  'outcome' | 'automation_reason' | 'heat_tag' | 'inbound_count' | 'agent_sent_count' | 'human_sent_count'
>

// Calculée à chaque affichage depuis la conversation : rien à synchroniser, rien de périmé.
export function prospectStage(conv: StageInput, hasActiveBooking: boolean): ProspectStage {
  if (conv.outcome === 'won') return 'won'
  if (conv.outcome === 'lost') return 'lost'
  if (hasActiveBooking || BOOKED_REASONS.includes(conv.automation_reason ?? '')) return 'booked'
  if (conv.heat_tag === 'hot' || conv.heat_tag === 'warm') return 'qualified'
  if (conv.heat_tag === 'cold') return 'unqualified'
  if (conv.inbound_count >= 2 || conv.agent_sent_count + conv.human_sent_count > 0) return 'talking'
  return 'new'
}

export type NextAction =
  | { key: 'error'; needsCoach: true }
  | { key: 'awaiting_reply'; needsCoach: true }
  | { key: 'manual_followup'; needsCoach: true }
  | { key: 'followup_planned'; at: string; needsCoach: false }
  | { key: 'assistant_replying'; needsCoach: false }
  | { key: 'goal_reached'; needsCoach: false }
  | { key: 'paused'; needsCoach: false }

type ActionInput = StageInput &
  Pick<
    Conversation,
    'automation_state' | 'last_message_at' | 'last_customer_message_at' | 'metadata' | 'heat_tag'
  >

export function nextAction(
  conv: ActionInput,
  opts: { followupAt: string | null; humanAgent: boolean; now: number },
): NextAction | null {
  if (conv.outcome) return null
  if (conv.automation_state === 'error') return { key: 'error', needsCoach: true }
  const lastCustomer = conv.last_customer_message_at ? Date.parse(conv.last_customer_message_at) : NaN
  const lastMessage = conv.last_message_at ? Date.parse(conv.last_message_at) : NaN
  const customerWroteLast = Number.isFinite(lastCustomer) && !(lastMessage > lastCustomer)
  // En pause ou objectif atteint, l'agent ne répond plus : le dernier message du prospect attend une personne.
  if (
    (conv.automation_state === 'stopped' || conv.automation_state === 'condition_stop') &&
    conv.automation_reason !== 'imported_history' &&
    customerWroteLast
  ) {
    return { key: 'awaiting_reply', needsCoach: true }
  }
  if (opts.followupAt) return { key: 'followup_planned', at: opts.followupAt, needsCoach: false }
  if (opts.humanAgent && needsManualFollowup(conv, opts.now)) return { key: 'manual_followup', needsCoach: true }
  if (conv.automation_state === 'scheduled' && conv.automation_reason === 'human_active') {
    return { key: 'awaiting_reply', needsCoach: true }
  }
  if (conv.automation_state === 'scheduled' || conv.automation_state === 'pending') {
    return { key: 'assistant_replying', needsCoach: false }
  }
  if (conv.automation_state === 'condition_stop') return { key: 'goal_reached', needsCoach: false }
  if (conv.automation_state === 'stopped' && conv.automation_reason !== 'imported_history') {
    return { key: 'paused', needsCoach: false }
  }
  return null
}
