-- Coeur conversationnel V2 : contacts, conversations, messages, deals,
-- rendez-vous et relances. Diffusion Realtime sur conversations et messages.

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  full_name text,
  phone_e164 text,
  instagram_handle text,
  instagram_user_id text,
  email text,
  source text not null default 'conversation' check (source in ('manual', 'csv_import', 'conversation')),
  tags text[] not null default '{}',
  notes text,
  conversation_id bigint,
  status text not null default 'new' check (status in ('new', 'contacted', 'replied', 'booked', 'won', 'lost')),
  last_interaction_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contacts_user_idx on public.contacts (user_id, last_interaction_at desc);

create trigger trg_contacts_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

create table public.conversations (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  assistant_id uuid references public.assistants (id) on delete set null,
  channel_account_id uuid references public.channel_accounts (id) on delete set null,
  provider text not null default 'instagram' check (provider in ('instagram', 'whatsapp', 'gmail')),
  external_thread_id text not null,
  contact_id uuid references public.contacts (id) on delete set null,
  contact_external_id text,
  contact_name text,
  contact_handle text,
  automation_state text not null default 'idle'
    check (automation_state in ('idle', 'scheduled', 'pending', 'stopped', 'condition_stop', 'error')),
  automation_reason text,
  next_reply_at timestamptz,
  pending_since timestamptz,
  pending_cursor_at timestamptz,
  pending_inbound_count integer not null default 0,
  is_processing boolean not null default false,
  processing_started_at timestamptz,
  debounce_until timestamptz,
  last_agent_reply_at timestamptz,
  last_message_at timestamptz,
  last_message_preview text,
  unread_count integer not null default 0,
  inbound_count integer not null default 0,
  agent_sent_count integer not null default 0,
  human_sent_count integer not null default 0,
  heat_tag text not null default 'unknown' check (heat_tag in ('unknown', 'hot', 'warm', 'cold')),
  heat_reason text,
  summary text,
  outcome text check (outcome in ('won', 'lost')),
  closed_at timestamptz,
  last_error_code text,
  last_error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel_account_id, external_thread_id)
);

create index conversations_inbox_idx on public.conversations (user_id, last_message_at desc);
create index conversations_due_idx on public.conversations (next_reply_at)
  where automation_state = 'scheduled';

create trigger trg_conversations_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

alter table public.contacts
  add constraint contacts_conversation_fkey
  foreign key (conversation_id) references public.conversations (id) on delete set null;

create table public.conversation_messages (
  id bigint generated always as identity primary key,
  conversation_id bigint not null references public.conversations (id) on delete cascade,
  provider text not null default 'instagram',
  external_message_id text,
  direction text not null check (direction in ('in', 'out')),
  author_type text not null check (author_type in ('customer', 'agent', 'human')),
  author_ref text,
  body_text text,
  attachments jsonb,
  message_type text not null default 'text' check (message_type in ('text', 'audio', 'image')),
  media_path text,
  media_mime text,
  media_duration_ms integer,
  transcript text,
  transcript_status text not null default 'none' check (transcript_status in ('none', 'processing', 'done', 'failed')),
  transcript_error text,
  send_state text not null default 'received' check (send_state in ('received', 'queued', 'sent', 'failed', 'cancelled')),
  error_code text,
  error_message text,
  automation_start timestamptz,
  automation_end timestamptz,
  read_by_contact_at timestamptz,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index conv_msgs_ext_uniq on public.conversation_messages (provider, external_message_id)
  where external_message_id is not null;
create index conv_msgs_by_conv_idx on public.conversation_messages (conversation_id, sent_at, id);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  conversation_id bigint not null references public.conversations (id) on delete cascade,
  amount numeric,
  status text not null default 'open' check (status in ('open', 'won', 'lost')),
  closed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index deals_user_idx on public.deals (user_id, closed_at desc);

create trigger trg_deals_updated_at
  before update on public.deals
  for each row execute function public.set_updated_at();

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  conversation_id bigint references public.conversations (id) on delete set null,
  event_type_uri text,
  event_type_name text,
  invitee_email text,
  invitee_name text,
  event_uri text,
  event_start_at timestamptz,
  event_end_at timestamptz,
  status text not null default 'active' check (status in ('active', 'canceled')),
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create index bookings_user_idx on public.bookings (user_id, created_at desc);

create table public.followups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  conversation_id bigint not null references public.conversations (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  provider text not null default 'instagram' check (provider in ('instagram', 'whatsapp')),
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'sent', 'skipped', 'cancelled')),
  message_body text,
  created_by text not null default 'human' check (created_by in ('auto', 'human')),
  created_at timestamptz not null default now()
);

create index followups_due_idx on public.followups (status, scheduled_at);

do $$
begin
  begin
    alter publication supabase_realtime add table public.conversations;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.conversation_messages;
  exception when duplicate_object then null;
  end;
end $$;
