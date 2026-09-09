-- Drapeaux de fonctionnalité (step by step : hidden -> staff -> beta -> all),
-- avis utilisateurs, journal d'audit admin et événements système.

create table public.feature_flags (
  key text primary key,
  label text not null,
  description text,
  stage text not null default 'hidden' check (stage in ('hidden', 'staff', 'beta', 'all')),
  notes text,
  updated_at timestamptz not null default now()
);

insert into public.feature_flags (key, label, stage) values
  ('contacts_import', 'Import de contacts CSV', 'all'),
  ('whatsapp', 'Canal WhatsApp', 'hidden'),
  ('calendly', 'Rendez-vous Calendly', 'hidden'),
  ('followups', 'Relances automatiques', 'hidden'),
  ('voice_messages', 'Messages vocaux', 'hidden'),
  ('voice_calls', 'Appels', 'hidden'),
  ('gmail', 'Canal Gmail', 'hidden'),
  ('scraping', 'Scraping', 'hidden'),
  ('crm', 'CRM avancé', 'hidden'),
  ('instagram_comments', 'Commentaires Instagram', 'hidden'),
  ('custom_tone', 'Ton personnalisé', 'hidden'),
  ('context_documents', 'Documents de contexte', 'hidden')
on conflict (key) do nothing;

create table public.user_feature_overrides (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  key text not null references public.feature_flags (key) on delete cascade,
  enabled boolean not null,
  primary key (user_id, key)
);

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (user_id) on delete set null,
  rating integer check (rating between 1 and 5),
  message text not null,
  page text,
  created_at timestamptz not null default now()
);

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  target_user_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.system_events (
  id bigint generated always as identity primary key,
  level text not null default 'info' check (level in ('info', 'warn', 'error')),
  source text not null,
  user_id uuid,
  conversation_id bigint,
  message text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index system_events_created_idx on public.system_events (created_at desc);
