-- Vues de statistiques (RLS respectée via security_invoker) et RPC admin,
-- toutes gardées par les rôles et tracées dans admin_audit_log.

create view public.v_daily_message_counts
with (security_invoker = true) as
select
  c.user_id,
  date_trunc('day', m.sent_at) as day,
  count(*) filter (where m.author_type = 'customer') as inbound,
  count(*) filter (where m.author_type = 'agent') as agent_replies,
  count(*) filter (where m.author_type = 'human') as human_replies
from public.conversation_messages m
join public.conversations c on c.id = m.conversation_id
group by 1, 2;

create view public.v_conversation_funnel
with (security_invoker = true) as
select
  user_id,
  count(*) as total,
  count(*) filter (where heat_tag = 'hot') as hot,
  count(*) filter (where outcome = 'won') as won,
  count(*) filter (where outcome = 'lost') as lost,
  count(*) filter (where automation_state = 'error') as errors
from public.conversations
group by 1;

create or replace function public.log_admin_action(p_action text, p_target uuid, p_payload jsonb)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.admin_audit_log (actor_id, action, target_user_id, payload)
  values (auth.uid(), p_action, p_target, coalesce(p_payload, '{}'::jsonb));
$$;

create or replace function public.admin_set_role(p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_current text;
begin
  if not public.is_owner() then
    raise exception 'seul le propriétaire gère les rôles';
  end if;
  if p_role not in ('user', 'viewer', 'admin') then
    raise exception 'rôle invalide';
  end if;
  select role into v_current from public.profiles where user_id = p_user;
  if v_current is null then
    raise exception 'utilisateur introuvable';
  end if;
  if v_current = 'owner' then
    raise exception 'le rôle owner ne peut pas être modifié';
  end if;
  update public.profiles set role = p_role, updated_at = now() where user_id = p_user;
  perform public.log_admin_action('set_role', p_user, jsonb_build_object('role', p_role));
end $$;

create or replace function public.admin_set_plan_override(p_user uuid, p_override text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin_or_owner() then
    raise exception 'accès refusé';
  end if;
  if p_override is not null and p_override not in ('beta_byok', 'free_unlimited') then
    raise exception 'override invalide';
  end if;
  update public.profiles set plan_override = p_override, updated_at = now() where user_id = p_user;
  perform public.log_admin_action('set_plan_override', p_user, jsonb_build_object('override', p_override));
end $$;

-- p_delta positif = crédits rendus, négatif = crédits retirés.
create or replace function public.admin_adjust_credits(p_user uuid, p_delta integer)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin_or_owner() then
    raise exception 'accès refusé';
  end if;
  update public.profiles
    set credits_consumed_in_period = greatest(coalesce(credits_consumed_in_period, 0) - p_delta, 0),
        updated_at = now()
    where user_id = p_user;
  insert into public.paiement_credit_transactions (user_id, type, amount)
    values (p_user, 'adjustment', p_delta);
  perform public.log_admin_action('adjust_credits', p_user, jsonb_build_object('delta', p_delta));
end $$;

create or replace function public.admin_set_flag(p_key text, p_stage text, p_notes text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin_or_owner() then
    raise exception 'accès refusé';
  end if;
  if p_stage not in ('hidden', 'staff', 'beta', 'all') then
    raise exception 'stage invalide';
  end if;
  update public.feature_flags
    set stage = p_stage, notes = coalesce(p_notes, notes), updated_at = now()
    where key = p_key;
  perform public.log_admin_action('set_flag', null, jsonb_build_object('key', p_key, 'stage', p_stage));
end $$;

create or replace function public.admin_set_user_flag(p_user uuid, p_key text, p_enabled boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin_or_owner() then
    raise exception 'accès refusé';
  end if;
  if p_enabled is null then
    delete from public.user_feature_overrides where user_id = p_user and key = p_key;
  else
    insert into public.user_feature_overrides (user_id, key, enabled)
    values (p_user, p_key, p_enabled)
    on conflict (user_id, key) do update set enabled = excluded.enabled;
  end if;
  perform public.log_admin_action('set_user_flag', p_user, jsonb_build_object('key', p_key, 'enabled', p_enabled));
end $$;

create or replace function public.admin_pause_assistant(p_assistant uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin_or_owner() then
    raise exception 'accès refusé';
  end if;
  update public.assistants
    set is_active = false, paused_reason = 'paused_by_admin', updated_at = now()
    where id = p_assistant;
  perform public.log_admin_action('pause_assistant', null, jsonb_build_object('assistant_id', p_assistant));
end $$;

create or replace function public.admin_dashboard_stats()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if not public.is_staff() then
    raise exception 'accès refusé';
  end if;
  select jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'active_subscriptions', (select count(*) from public.paiement_subscriptions where status in ('active', 'trialing')),
    'mrr_eur', (select coalesce(sum(700 + greatest(agents_settings_qty - 1, 0) * 60), 0)
                from public.paiement_subscriptions where status in ('active', 'trialing')),
    'assistants_active', (select count(*) from public.assistants where is_active),
    'conversations', (select count(*) from public.conversations),
    'messages_24h', (select count(*) from public.conversation_messages where sent_at > now() - interval '24 hours'),
    'agent_replies_24h', (select count(*) from public.conversation_messages
                          where author_type = 'agent' and sent_at > now() - interval '24 hours'),
    'errors_24h', (select count(*) from public.system_events
                   where level = 'error' and created_at > now() - interval '24 hours'),
    'ai_cost_month_usd', (select coalesce(sum(cost_estimate_usd), 0) from public.ai_usage
                          where created_at > date_trunc('month', now())),
    'expired_channels', (select count(*) from public.channel_accounts where status = 'expired')
  ) into v;
  return v;
end $$;

revoke all on function
  public.log_admin_action(text, uuid, jsonb),
  public.admin_set_role(uuid, text),
  public.admin_set_plan_override(uuid, text),
  public.admin_adjust_credits(uuid, integer),
  public.admin_set_flag(text, text, text),
  public.admin_set_user_flag(uuid, text, boolean),
  public.admin_pause_assistant(uuid),
  public.admin_dashboard_stats()
from public, anon;
grant execute on function
  public.admin_set_role(uuid, text),
  public.admin_set_plan_override(uuid, text),
  public.admin_adjust_credits(uuid, integer),
  public.admin_set_flag(text, text, text),
  public.admin_set_user_flag(uuid, text, boolean),
  public.admin_pause_assistant(uuid),
  public.admin_dashboard_stats()
to authenticated, service_role;
revoke all on function public.log_admin_action(text, uuid, jsonb) from authenticated;
grant execute on function public.log_admin_action(text, uuid, jsonb) to service_role;
