-- Un assistant = une configuration reliée à un compte de canal (unique).
-- settings est validé côté application (zod, settings_version).

create table public.assistants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  channel_account_id uuid unique references public.channel_accounts (id) on delete set null,
  name text not null default 'Mon assistant',
  is_active boolean not null default false,
  paused_reason text,
  settings jsonb not null default '{}'::jsonb,
  settings_version integer not null default 1,
  custom_tone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assistants_user_idx on public.assistants (user_id);

create trigger trg_assistants_updated_at
  before update on public.assistants
  for each row execute function public.set_updated_at();
