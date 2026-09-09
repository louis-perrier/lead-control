-- RPC du pipeline : crédits (avec plan_override), compteurs de conversation,
-- temporisation, réservation par le cron, fenêtre horaire et reprise.

alter table public.paiement_credit_transactions alter column stripe_event_id drop not null;

create or replace function public.can_consume_one_credit(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_credits_monthly integer;
  v_consumed bigint;
  v_override text;
begin
  select coalesce(credits_consumed_in_period, 0), plan_override
    into v_consumed, v_override
    from public.profiles where user_id = p_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'profile_not_found');
  end if;
  if v_override in ('free_unlimited', 'beta_byok') then
    return jsonb_build_object('ok', true, 'reason', v_override);
  end if;
  select credits_monthly into v_credits_monthly
    from public.paiement_subscriptions
    where user_id = p_user_id and status in ('active', 'trialing')
    order by updated_at desc limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_active_subscription');
  end if;
  if v_consumed >= v_credits_monthly then
    return jsonb_build_object('ok', false, 'reason', 'no_credits_left');
  end if;
  return jsonb_build_object('ok', true, 'reason', 'credits_available');
end $$;

create or replace function public.consume_one_credit(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_credits_monthly integer;
  v_consumed bigint;
  v_override text;
begin
  select coalesce(credits_consumed_in_period, 0), plan_override
    into v_consumed, v_override
    from public.profiles where user_id = p_user_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'profile_not_found');
  end if;
  if v_override not in ('free_unlimited', 'beta_byok') or v_override is null then
    select credits_monthly into v_credits_monthly
      from public.paiement_subscriptions
      where user_id = p_user_id and status in ('active', 'trialing')
      order by updated_at desc limit 1 for update;
    if not found then
      return jsonb_build_object('ok', false, 'reason', 'no_active_subscription');
    end if;
    if v_consumed >= v_credits_monthly then
      return jsonb_build_object('ok', false, 'reason', 'no_credits_left');
    end if;
  end if;
  update public.profiles
    set credits_consumed_in_period = coalesce(credits_consumed_in_period, 0) + 1,
        updated_at = now()
    where user_id = p_user_id;
  insert into public.paiement_credit_transactions (user_id, type, amount)
    values (p_user_id, 'spend', -1);
  return jsonb_build_object(
    'ok', true,
    'consumed_now', v_consumed + 1,
    'credits_monthly', v_credits_monthly,
    'credits_remaining', case when v_credits_monthly is null then null
      else greatest(v_credits_monthly - (v_consumed + 1), 0) end
  );
end $$;

create or replace function public.restitute_one_credit(p_user_id uuid)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.profiles
  set credits_consumed_in_period = greatest(coalesce(credits_consumed_in_period, 0) - 1, 0),
      updated_at = now()
  where user_id = p_user_id;
$$;

create or replace function public.bump_conversation_inbound(p_conversation_id bigint, p_now timestamptz, p_preview text)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.conversations
  set inbound_count = inbound_count + 1,
      unread_count = unread_count + 1,
      last_message_at = p_now,
      last_message_preview = p_preview,
      updated_at = p_now
  where id = p_conversation_id;
$$;

create or replace function public.bump_conversation_human_sent(p_conversation_id bigint, p_now timestamptz, p_preview text)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.conversations
  set human_sent_count = human_sent_count + 1,
      last_message_at = p_now,
      last_message_preview = p_preview,
      updated_at = p_now
  where id = p_conversation_id;
$$;

create or replace function public.schedule_conversation_debounce(p_conversation_id bigint, p_next_reply_at timestamptz, p_cursor_at timestamptz, p_automation_reason text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.conversations
  set automation_state = 'scheduled',
      next_reply_at = p_next_reply_at,
      debounce_until = p_next_reply_at,
      pending_since = coalesce(pending_since, now()),
      pending_cursor_at = coalesce(pending_cursor_at, p_cursor_at),
      pending_inbound_count = coalesce(pending_inbound_count, 0) + 1,
      automation_reason = p_automation_reason,
      updated_at = now()
  where id = p_conversation_id;
end $$;

create or replace function public.dispatch_scheduled_replies(p_limit integer)
returns table (
  id bigint, user_id uuid, assistant_id uuid, channel_account_id uuid,
  provider text, external_thread_id text, contact_external_id text,
  pending_cursor_at timestamptz, pending_inbound_count integer
) language sql security definer set search_path = public, pg_temp as $$
  with picked as (
    select c.id
    from public.conversations c
    where c.automation_state = 'scheduled'
      and c.next_reply_at is not null
      and c.next_reply_at <= now()
      and (c.debounce_until is null or c.debounce_until <= now())
    order by c.next_reply_at asc
    limit p_limit
    for update skip locked
  )
  update public.conversations c
  set automation_state = 'pending',
      is_processing = true,
      processing_started_at = now(),
      updated_at = now()
  from picked
  where c.id = picked.id
  returning c.id, c.user_id, c.assistant_id, c.channel_account_id,
    c.provider, c.external_thread_id, c.contact_external_id,
    c.pending_cursor_at, c.pending_inbound_count;
$$;

-- Prochain instant où l'assistant a le droit de répondre selon ses horaires.
-- Retourne p_at si la fenêtre est ouverte, null si aucun jour actif sous 8 jours.
create or replace function public.assistant_next_allowed_time(p_assistant_id uuid, p_at timestamptz)
returns timestamptz language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_settings jsonb;
  v_tz text;
  v_days jsonb;
  v_slots jsonb;
  v_start time;
  v_end time;
  v_day date;
  v_idx int;
  v_slot jsonb;
  v_win_start timestamptz;
  v_win_end timestamptz;
  v_best timestamptz;
  i int;
begin
  select a.settings, coalesce(p.timezone, 'Europe/Paris')
    into v_settings, v_tz
    from public.assistants a
    join public.profiles p on p.user_id = a.user_id
    where a.id = p_assistant_id;
  if v_settings is null then
    return p_at;
  end if;
  v_days := coalesce(v_settings->'schedule'->'days', '[true,true,true,true,true,true,true]'::jsonb);
  v_start := coalesce(nullif(v_settings->'schedule'->>'start', ''), '09:00')::time;
  v_end := coalesce(nullif(v_settings->'schedule'->>'end', ''), '20:00')::time;
  v_slots := v_settings->'schedule'->'slots';

  for i in 0..7 loop
    v_day := (p_at at time zone v_tz)::date + i;
    v_idx := extract(isodow from v_day)::int - 1;
    if coalesce((v_days->>v_idx)::boolean, true) then
      if jsonb_typeof(v_slots) = 'array' and jsonb_array_length(v_slots) > 0 then
        for v_slot in select * from jsonb_array_elements(v_slots) loop
          begin
            v_win_start := ((v_day + (v_slot->>'time')::time)::timestamp) at time zone v_tz;
            v_win_end := v_win_start + make_interval(mins => greatest(coalesce((v_slot->>'durationMinutes')::int, 30), 1));
          exception when others then
            continue;
          end;
          if p_at >= v_win_start and p_at < v_win_end then
            return p_at;
          elsif v_win_start > p_at and (v_best is null or v_win_start < v_best) then
            v_best := v_win_start;
          end if;
        end loop;
      else
        v_win_start := ((v_day + v_start)::timestamp) at time zone v_tz;
        v_win_end := ((v_day + v_end)::timestamp) at time zone v_tz;
        if p_at >= v_win_start and p_at < v_win_end then
          return p_at;
        elsif v_win_start > p_at and (v_best is null or v_win_start < v_best) then
          v_best := v_win_start;
        end if;
      end if;
    end if;
  end loop;
  return v_best;
end $$;

create or replace function public.resume_conversation(p_conversation_id bigint)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner uuid;
begin
  select user_id into v_owner from public.conversations where id = p_conversation_id;
  if v_owner is null then
    raise exception 'conversation introuvable';
  end if;
  if auth.uid() is not null and auth.uid() <> v_owner and not public.is_admin_or_owner() then
    raise exception 'accès refusé';
  end if;
  update public.conversations
  set automation_state = case when pending_cursor_at is not null then 'scheduled' else 'idle' end,
      next_reply_at = case when pending_cursor_at is not null then now() + interval '8 seconds' else null end,
      debounce_until = case when pending_cursor_at is not null then now() + interval '8 seconds' else null end,
      is_processing = false,
      processing_started_at = null,
      last_error_code = null,
      last_error_message = null,
      automation_reason = 'resumed',
      updated_at = now()
  where id = p_conversation_id;
end $$;

-- Création d'assistant avec quota : abonnement Stripe = agents_settings_qty,
-- plan_override = 1, sinon refus explicite.
create or replace function public.create_assistant(p_name text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_quota integer;
  v_count integer;
  v_override text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'non authentifié';
  end if;
  select plan_override into v_override from public.profiles where user_id = v_uid;
  select agents_settings_qty into v_quota
    from public.paiement_subscriptions
    where user_id = v_uid and status in ('active', 'trialing')
    order by updated_at desc limit 1;
  if v_quota is null then
    if v_override is not null then
      v_quota := 1;
    else
      raise exception 'no_subscription';
    end if;
  end if;
  select count(*) into v_count from public.assistants where user_id = v_uid;
  if v_count >= v_quota then
    raise exception 'assistant_quota_reached';
  end if;
  insert into public.assistants (user_id, name)
  values (v_uid, coalesce(nullif(trim(p_name), ''), 'Mon assistant'))
  returning id into v_id;
  return v_id;
end $$;

revoke all on function
  public.can_consume_one_credit(uuid), public.consume_one_credit(uuid),
  public.restitute_one_credit(uuid),
  public.bump_conversation_inbound(bigint, timestamptz, text),
  public.bump_conversation_human_sent(bigint, timestamptz, text),
  public.schedule_conversation_debounce(bigint, timestamptz, timestamptz, text),
  public.dispatch_scheduled_replies(integer),
  public.assistant_next_allowed_time(uuid, timestamptz)
from public, anon, authenticated;
grant execute on function
  public.can_consume_one_credit(uuid), public.consume_one_credit(uuid),
  public.restitute_one_credit(uuid),
  public.bump_conversation_inbound(bigint, timestamptz, text),
  public.bump_conversation_human_sent(bigint, timestamptz, text),
  public.schedule_conversation_debounce(bigint, timestamptz, timestamptz, text),
  public.dispatch_scheduled_replies(integer),
  public.assistant_next_allowed_time(uuid, timestamptz)
to service_role;

revoke all on function public.resume_conversation(bigint), public.create_assistant(text) from public, anon;
grant execute on function public.resume_conversation(bigint), public.create_assistant(text) to authenticated, service_role;
