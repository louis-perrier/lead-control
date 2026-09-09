export type AssistantContext = {
  conversationId: number
  productName: string
  context: string
  qualification: string
  stopText: string
  stopLink: string
  tone: string
  summary: string
}

export type AgentDecision = {
  reply_text: string | null
  should_response: boolean
  stop_successful: boolean
  should_notify_human: boolean
  heat_tag: 'hot' | 'warm' | 'cold' | 'unknown'
  heat_reason: string
  summary: string | null
  reason: string | null
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

const TONE_PRESETS: Record<string, string> = {
  amical: 'Sois chaleureux, naturel et bienveillant.',
  pro: 'Sois professionnel, concis et structuré.',
  fun: 'Sois décontracté, utilise l’humour avec légèreté.',
  normal:
    '- **Registre** : chaleureux, humain, direct. Tu parles comme quelqu’un qui comprend vraiment la situation de l’autre.',
}

export function resolveTone(preset: string | undefined, customTone: string | null | undefined) {
  if (preset === 'custom' && customTone?.trim()) return customTone.trim()
  return TONE_PRESETS[preset ?? 'normal'] ?? TONE_PRESETS.normal
}
