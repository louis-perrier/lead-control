-- Profils V2 : rôles (user, viewer, admin, owner), plan_override, fuseau.
-- Le rôle owner est unique, posé par la migration de données, intouchable via l'API.

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  role text not null default 'user' check (role in ('user', 'viewer', 'admin', 'owner')),
  plan_override text check (plan_override in ('beta_byok', 'free_unlimited')),
  timezone text not null default 'Europe/Paris',
  onboarding_completed_at timestamptz,
  credits_consumed_in_period bigint not null default 0,
  credits_period_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role in ('viewer', 'admin', 'owner')
  );
$$;

create or replace function public.is_admin_or_owner()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role in ('admin', 'owner')
  );
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'owner'
  );
$$;

revoke all on function public.is_staff(), public.is_admin_or_owner(), public.is_owner() from public, anon;
grant execute on function public.is_staff(), public.is_admin_or_owner(), public.is_owner() to authenticated, service_role;

-- Champs protégés : un utilisateur ne touche ni son rôle, ni son override, ni ses
-- crédits ; les changements de rôle passent par le owner ; le rôle owner ne se
-- donne ni ne se retire jamais via l'API (auth.uid() nul = migration ou SQL direct).
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if not public.is_admin_or_owner() then
    if new.role is distinct from old.role
      or new.plan_override is distinct from old.plan_override
      or new.email is distinct from old.email
      or new.credits_consumed_in_period is distinct from old.credits_consumed_in_period
      or new.credits_period_started_at is distinct from old.credits_period_started_at then
      raise exception 'champ protégé';
    end if;
  end if;
  if new.role is distinct from old.role then
    if not public.is_owner() then
      raise exception 'seul le propriétaire gère les rôles';
    end if;
    if old.role = 'owner' or new.role = 'owner' then
      raise exception 'le rôle owner ne peut pas être modifié';
    end if;
  end if;
  return new;
end $$;

create trigger trg_guard_profile_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

create or replace function public.handle_auth_user_created()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (user_id, email)
  values (new.id, coalesce(new.email, new.id::text))
  on conflict (user_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created_v2
  after insert on auth.users
  for each row execute function public.handle_auth_user_created();
