-- Comptes de canaux (Instagram en V1 client) et tokens dans le schéma secrets,
-- jamais exposés au client. Réutilise secrets.oauth_states en la remettant à plat.

create table public.channel_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  provider text not null check (provider in ('instagram', 'whatsapp', 'calendly', 'gmail')),
  external_id text not null,
  handle text,
  label text,
  status text not null default 'connected' check (status in ('connected', 'expired', 'error', 'disconnected')),
  token_expires_at timestamptz,
  last_refresh_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, external_id)
);

create index channel_accounts_lookup_idx on public.channel_accounts (provider, external_id);

create trigger trg_channel_accounts_updated_at
  before update on public.channel_accounts
  for each row execute function public.set_updated_at();

create table if not exists secrets.channel_tokens (
  channel_account_id uuid primary key references public.channel_accounts (id) on delete cascade,
  access_token text,
  long_lived_token text,
  refresh_token text,
  scopes text[],
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table secrets.channel_tokens enable row level security;

do $$
begin
  if to_regclass('secrets.oauth_states') is null then
    create table secrets.oauth_states (
      state text primary key,
      user_id uuid not null,
      provider text not null,
      return_to text,
      assistant_id uuid,
      expires_at timestamptz not null default now() + interval '10 minutes',
      consumed_at timestamptz,
      created_at timestamptz not null default now()
    );
    alter table secrets.oauth_states enable row level security;
  else
    delete from secrets.oauth_states;
    alter table secrets.oauth_states add column if not exists assistant_id uuid;
    alter table secrets.oauth_states alter column expires_at set default now() + interval '10 minutes';
    update secrets.oauth_states set expires_at = now() where expires_at is null;
    if not exists (
      select 1 from pg_constraint
      where conrelid = 'secrets.oauth_states'::regclass and contype = 'p'
    ) then
      alter table secrets.oauth_states add primary key (state);
    end if;
  end if;
end $$;
