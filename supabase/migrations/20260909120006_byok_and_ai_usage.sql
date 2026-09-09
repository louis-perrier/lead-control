-- Clé Anthropic des bêta-testeurs : stockée dans Vault, jamais lisible côté
-- client. Retirer l'override beta_byok supprime la clé et met l'assistant en pause.
-- ai_usage trace chaque réponse générée (transparence admin et bêta-testeur).

create table public.user_ai_keys (
  user_id uuid primary key references public.profiles (user_id) on delete cascade,
  provider text not null default 'anthropic',
  vault_secret_id uuid,
  key_hint text,
  status text not null default 'unknown' check (status in ('unknown', 'valid', 'invalid')),
  last_checked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  conversation_id bigint,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  key_source text not null check (key_source in ('platform', 'byok')),
  cost_estimate_usd numeric(10, 6),
  created_at timestamptz not null default now()
);

create index ai_usage_user_idx on public.ai_usage (user_id, created_at desc);

create or replace function public.set_user_ai_key(p_key text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_old uuid;
  v_new uuid;
  v_key text := trim(p_key);
begin
  if v_uid is null then
    raise exception 'non authentifié';
  end if;
  if v_key is null or length(v_key) < 20 then
    raise exception 'clé invalide';
  end if;
  select vault_secret_id into v_old from public.user_ai_keys where user_id = v_uid;
  if v_old is not null then
    perform vault.update_secret(v_old, v_key);
    v_new := v_old;
  else
    v_new := vault.create_secret(v_key, 'user_ai_key:' || v_uid);
  end if;
  insert into public.user_ai_keys (user_id, vault_secret_id, key_hint, status)
  values (v_uid, v_new, right(v_key, 4), 'unknown')
  on conflict (user_id) do update
    set vault_secret_id = excluded.vault_secret_id,
        key_hint = excluded.key_hint,
        status = 'unknown',
        last_checked_at = null;
end $$;

create or replace function public.internal_delete_user_ai_key(p_user uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_secret uuid;
begin
  select vault_secret_id into v_secret from public.user_ai_keys where user_id = p_user;
  if v_secret is not null then
    delete from vault.secrets where id = v_secret;
  end if;
  delete from public.user_ai_keys where user_id = p_user;
end $$;

create or replace function public.delete_user_ai_key()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then
    raise exception 'non authentifié';
  end if;
  perform public.internal_delete_user_ai_key(auth.uid());
end $$;

-- Lecture de la clé déchiffrée : service role uniquement (Edge Functions).
create or replace function public.get_user_ai_key(p_user uuid)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select ds.decrypted_secret
  from public.user_ai_keys k
  join vault.decrypted_secrets ds on ds.id = k.vault_secret_id
  where k.user_id = p_user;
$$;

-- Jeton interne des crons, comparé côté Edge Function.
create or replace function public.internal_token_matches(p_token text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'cron_internal_token' and decrypted_secret = p_token
  );
$$;

revoke all on function public.set_user_ai_key(text), public.delete_user_ai_key() from public, anon;
grant execute on function public.set_user_ai_key(text), public.delete_user_ai_key() to authenticated, service_role;
revoke all on function public.internal_delete_user_ai_key(uuid), public.get_user_ai_key(uuid), public.internal_token_matches(text) from public, anon, authenticated;
grant execute on function public.internal_delete_user_ai_key(uuid), public.get_user_ai_key(uuid), public.internal_token_matches(text) to service_role;

create or replace function public.on_plan_override_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.plan_override = 'beta_byok' and new.plan_override is distinct from 'beta_byok' then
    perform public.internal_delete_user_ai_key(new.user_id);
    update public.assistants
      set is_active = false, paused_reason = 'byok_removed', updated_at = now()
      where user_id = new.user_id and is_active;
  end if;
  return new;
end $$;

create trigger trg_on_plan_override_change
  after update of plan_override on public.profiles
  for each row execute function public.on_plan_override_change();
