import type { AgendaSettings } from '@/supabase/functions/_shared/agenda-slots'
import type { CalendlySettings } from '@/supabase/functions/_shared/calendly-settings'
import type { IcloseSettings } from '@/supabase/functions/_shared/iclose-settings'
import type { BookingMode } from './booking-mode'

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
  provider: 'instagram' | 'whatsapp' | 'calendly' | 'gmail' | 'google' | 'iclose' | 'slack'
  external_id: string
  handle: string | null
  label: string | null
  status: 'connected' | 'expired' | 'error' | 'disconnected'
  token_expires_at: string | null
  last_error: string | null
  metadata: Record<string, unknown> | null
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
  followups?: FollowupSettings
  method?: import('@/supabase/functions/assistant-dispatch/method-prompt').MethodSettings
  ignore_solicitors?: boolean
  canned_responses?: CannedResponse[]
  booking?: {
    mode?: BookingMode
    /** Qui mène l'appel quand l'assistant le réserve : le compte, ou une autre personne nommée. */
    host?: { who?: 'me' | 'other'; label?: string }
    calendar?: Partial<AgendaSettings>
    calendly?: Partial<CalendlySettings>
    iclose?: Partial<IcloseSettings>
  }
  /** Ressources que l'assistant peut envoyer en phase de découverte (module discovery_flow). */
  resources?: { id: string; title: string; url: string; when: string }[]
}

export type FollowupItem = {
  id: string
  delay_minutes: number
  kind: 'text' | 'audio'
  /** Réglages d'avant la réserve commune, relus une dernière fois par l'écran. */
  variants?: string[]
  /** 'random' ou l'id d'un message de la réserve. */
  pick?: string
  media_path?: string
  media_mime?: string
  media_duration_ms?: number
  transcript?: string
}

/** Relance proposée au coach après 24 h, envoyée par lui en un clic (module Human Agent). */
export type AssistedFollowup = {
  id: string
  days: number
  text: string
}

export type FollowupMessage = { id: string; text: string }

export type FollowupVariantKind = 'text' | 'audio' | 'image'
export type FollowupStepKind = 'like' | 'message' | 'notify'

export type FollowupVariant = {
  id: string
  kind: FollowupVariantKind
  text?: string
  media_path?: string
  media_mime?: string
  media_duration_ms?: number
  /** Vocal : transcription. Image : ce que montre l'image, lue par l'assistant. */
  transcript?: string
}

/** Une étape de la séquence. `at_minutes` se compte depuis le dernier message du compte. */
export type FollowupStep = {
  id: string
  at_minutes: number
  kind: FollowupStepKind
  variants: FollowupVariant[]
}

export type FollowupSettings = {
  enabled?: boolean
  after_own_message?: boolean
  version?: number
  steps?: FollowupStep[]
  /** Réglages d'avant la séquence, encore lus tant qu'ils n'ont pas été réenregistrés. */
  messages?: FollowupMessage[]
  items?: FollowupItem[]
  assisted?: AssistedFollowup[]
}

export type CannedResponse = {
  id: string
  trigger: string
  kind: 'text' | 'audio'
  text?: string
  media_path?: string
  media_mime?: string
  media_duration_ms?: number
  moment?: string
  transcript?: string
}

export type Followup = {
  id: string
  conversation_id: number
  slot_index: number
  scheduled_at: string
  status: 'pending' | 'sending' | 'sent' | 'notified' | 'skipped' | 'cancelled'
}

/** Relance proposée au coach et pas encore envoyée depuis Instagram (vue v_followups_to_send). */
export type FollowupToSend = {
  id: string
  conversation_id: number
  assistant_id: string | null
  item_id: string | null
  variant_id: string | null
  message_body: string | null
  sent_at: string
}

export type FollowupVariantStat = { step_id: string | null; variant_id: string | null; sent: number; replied: number }

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
  custom_tone_answers: Record<string, string>
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
  contact_avatar_path: string | null
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
  last_customer_message_at: string | null
  metadata: Record<string, unknown> | null
  notes: string | null
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
  reaction: string | null
}

export type ContextDocument = {
  id: number
  title: string
  status: 'processing' | 'ready' | 'error'
  char_count: number | null
  source_char_count?: number | null
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
  provider: 'calendly' | 'google' | 'iclose'
  meet_link: string | null
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

export type AppNotification = {
  id: number
  user_id: string
  conversation_id: number | null
  kind: 'needs_you' | 'blocked' | 'followup'
  body: string
  created_at: string
  read_at: string | null
  conversations: { contact_name: string | null; contact_handle: string | null; contact_avatar_path: string | null } | null
}
