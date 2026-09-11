export type Role = 'user' | 'viewer' | 'admin' | 'owner'
export type PlanOverride = 'beta_byok' | 'free_unlimited' | null
export type FlagStage = 'hidden' | 'staff' | 'beta' | 'all'
export type AutomationState = 'idle' | 'scheduled' | 'pending' | 'stopped' | 'condition_stop' | 'error'
export type HeatTag = 'unknown' | 'hot' | 'warm' | 'cold'

export type CompanySize = '1' | '2-10' | '11-50' | '51-200' | '200+'

export type Profile = {
  user_id: string
  email: string
  full_name: string | null
  role: Role
  plan_override: PlanOverride
  plan_override_since: string | null
  timezone: string
  city: string | null
  company_name: string | null
  company_size: CompanySize | null
  onboarding_completed_at: string | null
  credits_consumed_in_period: number
  created_at: string
}

export type ChannelAccount = {
  id: string
  user_id: string
  provider: 'instagram' | 'whatsapp' | 'calendly' | 'gmail'
  external_id: string
  handle: string | null
  label: string | null
  status: 'connected' | 'expired' | 'error' | 'disconnected'
  token_expires_at: string | null
  last_error: string | null
}

export type AssistantSettings = {
  product?: { name?: string }
  context?: string
  qualification?: string
  stop_condition?: {
    text?: string
    link?: string
    secondary_links?: { id: string; condition: string; link: string }[]
  }
  tone?: { preset?: string }
  schedule?: {
    always_on?: boolean
    days?: boolean[]
    start?: string
    end?: string
    slots?: { time: string; durationMinutes: number }[]
  }
  audience?: { mode?: 'all' | 'allowlist' | 'blocklist'; handles?: string[] }
  deal?: { average_value?: number | null }
}

export type Assistant = {
  id: string
  user_id: string
  channel_account_id: string | null
  name: string
  is_active: boolean
  paused_reason: string | null
  settings: AssistantSettings
  custom_tone: string | null
  custom_tone_questions: { id: string; question: string }[]
  custom_tone_generated_at: string | null
}

export type Conversation = {
  id: number
  user_id: string
  assistant_id: string | null
  channel_account_id: string | null
  provider: string
  contact_id: string | null
  contact_name: string | null
  contact_handle: string | null
  automation_state: AutomationState
  automation_reason: string | null
  next_reply_at: string | null
  last_message_at: string | null
  last_message_preview: string | null
  unread_count: number
  inbound_count: number
  agent_sent_count: number
  human_sent_count: number
  heat_tag: HeatTag
  heat_reason: string | null
  summary: string | null
  outcome: 'won' | 'lost' | null
  closed_at: string | null
  last_error_message: string | null
}

export type ConversationMessage = {
  id: number
  conversation_id: number
  direction: 'in' | 'out'
  author_type: 'customer' | 'agent' | 'human'
  body_text: string | null
  message_type: 'text' | 'audio' | 'image'
  media_path: string | null
  transcript: string | null
  transcript_status: 'none' | 'processing' | 'done' | 'failed'
  send_state: 'received' | 'queued' | 'sent' | 'failed' | 'cancelled'
  sent_at: string
}

export type ContextDocument = {
  id: number
  title: string
  status: 'processing' | 'ready' | 'error'
  char_count: number | null
  error_message: string | null
  created_at: string
}

export type Contact = {
  id: string
  full_name: string | null
  instagram_handle: string | null
  phone_e164: string | null
  email: string | null
  status: 'new' | 'contacted' | 'replied' | 'booked' | 'won' | 'lost'
  notes: string | null
  tags: string[]
  conversation_id: number | null
  last_interaction_at: string | null
  source: string
}

export type Booking = {
  id: string
  conversation_id: number | null
  event_type_name: string | null
  invitee_email: string | null
  invitee_name: string | null
  event_start_at: string | null
  event_end_at: string | null
  status: 'active' | 'canceled'
}

export type FeatureFlag = {
  key: string
  label: string
  description: string | null
  stage: FlagStage
  notes: string | null
}

export type BillingInfo = {
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'inactive'
  planKey: 'coach_basic' | 'coach_premium' | 'none' | 'override'
  planOverride: PlanOverride
  agentsSettingsQty: number
  creditsMonthly: number
  creditsConsumed: number
  creditsRemaining: number | null
  currentPeriodEnd: string | null
  isTrial: boolean
}
