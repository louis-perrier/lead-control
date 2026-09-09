-- Reprise des données V1 depuis le schéma legacy : profils (owner et overrides),
-- comptes Instagram et Calendly avec leurs tokens, assistants actifs transposés.
-- Les conversations V1 ne sont pas reprises (purge décidée). Idempotente, et
-- sans effet sur une base vierge (le schéma legacy n'y existe pas).

do $$
begin
  if to_regclass('legacy.public_profiles') is null then
    return;
  end if;

  insert into public.profiles (user_id, email, role, plan_override, credits_consumed_in_period, credits_period_started_at, created_at)
  select
    p.user_id,
    p.email,
    case when p.email = 'tifasi.duracuir@gmail.com' then 'owner' else 'user' end,
    case when upper(trim(p.plan)) in ('TESTEUR', 'DEVELOPPEUR') then 'free_unlimited' else null end,
    coalesce(p.credits_consumed_in_period, 0),
    p.credits_period_started_at,
    p.created_at
  from legacy.public_profiles p
  join auth.users u on u.id = p.user_id
  on conflict (user_id) do nothing;

  insert into public.channel_accounts (id, user_id, provider, external_id, handle, status, token_expires_at, connected_at)
  select
    a.id,
    a.user_id,
    a.provider,
    coalesce(a.id_user_plateform, a.id::text),
    a.connectors_label,
    case when a.expires_in is not null and a.expires_in < now() then 'expired' else 'connected' end,
    a.expires_in,
    coalesce(a.created_at, now())
  from legacy.all_connectors_users a
  join public.profiles pr on pr.user_id = a.user_id
  where a.provider in ('instagram', 'calendly')
  on conflict do nothing;

  if to_regclass('secrets.connectors_token') is not null then
    insert into secrets.channel_tokens (channel_account_id, access_token, long_lived_token, scopes, expires_at, metadata, updated_at)
    select t.id, t.access_token, t.long_lived_token, t.scopes, t.expires_in,
      coalesce(t.metadata, '{}'::jsonb), coalesce(t.updated_at, now())
    from secrets.connectors_token t
    join public.channel_accounts ca on ca.id = t.id
    on conflict (channel_account_id) do nothing;
  end if;

  with cfg as (
    select
      ac.configs_id, ac.user_id, ac.name_modif, ac.configs, ac.tone_personnalize, ac.created_at,
      (
        select cca.user_connexion_id
        from legacy.connectors_config_agent cca
        join public.channel_accounts ch on ch.id = cca.user_connexion_id and ch.provider = 'instagram'
        where cca.configs_id = ac.configs_id
        limit 1
      ) as chan
    from legacy.agent_configs ac
    where ac.is_active
  ),
  dedup as (
    select cfg.*, row_number() over (partition by chan order by created_at) as rn from cfg
  )
  insert into public.assistants (id, user_id, channel_account_id, name, is_active, paused_reason, settings, custom_tone, created_at)
  select
    d.configs_id,
    d.user_id,
    case when d.rn = 1 then d.chan else null end,
    coalesce(nullif(d.name_modif, ''), 'Mon assistant'),
    false,
    'v2_migration',
    jsonb_build_object(
      'product', jsonb_build_object('name', coalesce(d.configs->'Details'->>'productName', '')),
      'context', coalesce(d.configs->'Details'->>'context', ''),
      'qualification', coalesce(d.configs->'Details'->>'qualification', ''),
      'stop_condition', jsonb_build_object(
        'text', coalesce(d.configs->'Details'->>'stopText', ''),
        'link', coalesce(d.configs->'Details'->>'stopLink', '')
      ),
      'tone', jsonb_build_object('preset', coalesce(d.configs->'Details'->>'tone', 'normal')),
      'schedule', jsonb_build_object(
        'days', '[true,true,true,true,true,true,true]'::jsonb,
        'start', coalesce(d.configs->'Details'->>'timeStart', '09:00'),
        'end', coalesce(d.configs->'Details'->>'timeEnd', '20:00'),
        'slots', coalesce(d.configs->'Details'->'timeSlots', '[]'::jsonb)
      ),
      'audience', jsonb_build_object('mode', 'all', 'handles', '[]'::jsonb),
      'deal', jsonb_build_object('average_value', nullif(d.configs->>'avg_deal_value', '')::numeric)
    ),
    d.tone_personnalize,
    d.created_at
  from dedup d
  join public.profiles pr on pr.user_id = d.user_id
  on conflict (id) do nothing;
end $$;
