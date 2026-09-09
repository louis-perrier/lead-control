export type AssistantContext = {
  conversationId: number
  productName: string
  context: string
  qualification: string
  stopText: string
  stopLink: string
  customTone: string | null
  summary: string
}

export type AgentDecision = {
  reply_text: string | null
  should_response: boolean
  stop_condition_reached: boolean
  notify_human: boolean
  heat: 'hot' | 'warm' | 'cold' | 'unknown'
  heat_reason: string
  summary_update: string | null
}

export type WindowMessage = {
  direction: 'in' | 'out'
  author_type: 'customer' | 'agent' | 'human'
  body_text: string | null
  message_type: 'text' | 'audio' | 'image'
  transcript: string | null
  transcript_status: string
  transcript_error: string | null
  sent_at: string
  id: number
}
