// Fenêtres d'envoi Instagram, comptées depuis le dernier message écrit par le prospect.
// Aucun import : partagé par messages-send, la boîte de réception et les tests.

export const STANDARD_WINDOW_MS = 24 * 3600 * 1000
export const HUMAN_AGENT_WINDOW_MS = 7 * 24 * 3600 * 1000

// standard : envoi libre ; human_agent : envoi manuel avec le tag ; expired : au-delà de 24 h
// sans Human Agent ; closed : rien ne part tant que le prospect n'a pas réécrit.
export type ManualSendMode = 'standard' | 'human_agent' | 'expired' | 'closed'

export function manualSendMode(lastCustomerAt: string | null | undefined, now: number, humanAgentEnabled: boolean): ManualSendMode {
  const last = lastCustomerAt ? Date.parse(lastCustomerAt) : NaN
  if (!Number.isFinite(last)) return 'closed'
  const age = now - last
  if (age <= STANDARD_WINDOW_MS) return 'standard'
  if (age <= HUMAN_AGENT_WINDOW_MS) return humanAgentEnabled ? 'human_agent' : 'expired'
  return 'closed'
}

export function humanAgentRemainingMs(lastCustomerAt: string | null | undefined, now: number) {
  const last = lastCustomerAt ? Date.parse(lastCustomerAt) : NaN
  if (!Number.isFinite(last)) return 0
  return Math.max(0, last + HUMAN_AGENT_WINDOW_MS - now)
}

// « 4 j 6 h », « 5 h », « 40 min » : assez précis pour décider, sans compte à rebours.
export function formatRemaining(ms: number) {
  const minutes = Math.floor(ms / 60000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (days > 0) return hours > 0 ? `${days} j ${hours} h` : `${days} j`
  if (hours > 0) return `${hours} h`
  return `${Math.max(1, minutes)} min`
}

export type ManualFollowupCandidate = {
  last_customer_message_at: string | null
  last_message_at: string | null
  heat_tag: string | null
  outcome: string | null
  automation_state: string
  metadata?: Record<string, unknown> | null
}

// « À relancer » : le prospect s'est tu après notre dernier message, l'envoi automatique
// n'est plus permis mais une réponse à la main l'est encore.
export function needsManualFollowup(conv: ManualFollowupCandidate, now: number) {
  if (manualSendMode(conv.last_customer_message_at, now, true) !== 'human_agent') return false
  if (conv.heat_tag === 'cold' || conv.outcome || conv.automation_state === 'error') return false
  const lastCustomer = Date.parse(conv.last_customer_message_at!)
  const lastMessage = conv.last_message_at ? Date.parse(conv.last_message_at) : NaN
  if (!(lastMessage > lastCustomer)) return false
  const dismissed = conv.metadata?.assisted_dismissed_at
  return !(typeof dismissed === 'string' && Date.parse(dismissed) > lastCustomer)
}

export type AssistedTemplate = { id: string; days: number; text: string }

// Le message du jour le plus avancé déjà atteint depuis notre dernier envoi.
export function assistedSuggestion(templates: AssistedTemplate[] | undefined, lastMessageAt: string | null, now: number) {
  const last = lastMessageAt ? Date.parse(lastMessageAt) : NaN
  if (!Number.isFinite(last)) return null
  const elapsedDays = (now - last) / (24 * 3600 * 1000)
  const reached = (templates ?? []).filter((t) => t.text.trim() && t.days <= elapsedDays)
  return reached.sort((a, b) => b.days - a.days)[0] ?? null
}
