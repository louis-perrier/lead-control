-- Prise de rendez-vous dans Google Agenda : l'agent crée lui-même l'événement Meet.
-- Les réservations Google partagent la table bookings avec Calendly.

alter table public.channel_accounts drop constraint if exists channel_accounts_provider_check;
alter table public.channel_accounts add constraint channel_accounts_provider_check
  check (provider in ('instagram', 'whatsapp', 'calendly', 'gmail', 'google'));

alter table public.bookings add column if not exists provider text not null default 'calendly';
alter table public.bookings drop constraint if exists bookings_provider_check;
alter table public.bookings add constraint bookings_provider_check check (provider in ('calendly', 'google'));
alter table public.bookings add column if not exists external_event_id text;
alter table public.bookings add column if not exists meet_link text;

create unique index if not exists bookings_provider_event_key
  on public.bookings (provider, external_event_id) where external_event_id is not null;
-- Un seul appel Google actif par conversation : la réservation rejouée retombe sur celui-ci.
create unique index if not exists bookings_google_active_conversation_key
  on public.bookings (conversation_id) where provider = 'google' and status = 'active';
create unique index if not exists bookings_event_uri_key
  on public.bookings (event_uri) where event_uri is not null;

-- Présent en production sans migration : ajouté ici pour que le rejeu le recrée.
create index if not exists idx_oauth_states_user_provider
  on secrets.oauth_states (user_id, provider, created_at desc);

insert into public.feature_flags (key, label, description, stage)
values ('google_calendar', 'Rendez-vous Google Agenda', 'L''agent propose des créneaux et réserve l''appel Meet dans l''agenda', 'hidden')
on conflict (key) do nothing;

create or replace function public.notify_conversation_error()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_code text := coalesce(new.last_error_code, new.automation_reason, '');
  v_kind text := 'blocked';
  v_key text := 'conv:' || new.id || ':blocked';
  v_body text;
begin
  if v_code in ('notify_human', 'model_output_unreadable', 'no_reply') then
    v_kind := 'needs_you';
    v_key := 'conv:' || new.id;
    v_body := split_part(coalesce(nullif(trim(new.last_error_message), ''), 'L''assistant a besoin de vous sur cette conversation.'), '. ', 1);
  elsif v_code in ('channel_token_missing', 'channel_missing') then
    v_key := 'code:channel';
    v_body := 'Instagram à reconnecter';
  elsif v_code = 'calendar_token_expired' then
    v_key := 'code:google';
    v_body := 'Agenda Google à reconnecter';
  elsif v_code = 'no_credits_left' then
    v_key := 'code:' || v_code;
    v_body := 'Crédits épuisés';
  elsif v_code = 'no_active_subscription' then
    v_key := 'code:' || v_code;
    v_body := 'Abonnement inactif';
  elsif v_code in ('missing_api_key', 'invalid_api_key') then
    v_key := 'code:api_key';
    v_body := 'Clé API à vérifier';
  elsif v_code = 'send_failed' then
    v_body := 'Envoi Instagram refusé';
  elsif v_code in ('ai_error', 'dispatch_error') then
    v_body := 'Erreur technique';
  else
    v_body := coalesce(nullif(trim(new.last_error_message), ''), 'L''assistant est arrêté sur cette conversation.');
  end if;

  begin
    if v_key like 'conv:%' then
      update public.notifications
      set read_at = now()
      where user_id = new.user_id and dedupe_key = v_key and read_at is null;
    end if;
    insert into public.notifications (user_id, conversation_id, kind, body, dedupe_key)
    values (new.user_id, new.id, v_kind, left(v_body, 120), v_key)
    on conflict (user_id, dedupe_key) where read_at is null
    do update set body = excluded.body, conversation_id = excluded.conversation_id, created_at = now();
  exception when others then
    null;
  end;
  return new;
end $$;

revoke all on function public.notify_conversation_error() from public, anon, authenticated;

-- Un rendez-vous réservé clôt aussi les relances : le prospect n'a plus à être relancé.
drop trigger if exists trg_followups_cancel_on_state on public.conversations;
create trigger trg_followups_cancel_on_state
after update of automation_state on public.conversations
for each row when (
  new.automation_state is distinct from old.automation_state
  and (
    new.automation_state in ('stopped', 'error')
    or (new.automation_state = 'condition_stop' and new.automation_reason in ('calendly_booked', 'calendar_booked'))
  )
)
execute function public.followups_cancel_on_state();

-- Les comptes Calendly ou Google expirés ne sont pas des comptes Instagram à reconnecter.
create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
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
    'expired_channels', (select count(*) from public.channel_accounts where status = 'expired' and provider = 'instagram')
  ) into v;
  return v;
end $$;

revoke all on function public.admin_dashboard_stats() from public, anon;
grant execute on function public.admin_dashboard_stats() to authenticated, service_role;

do $$
begin
  perform cron.unschedule('google-calendar-sync-daily');
exception when others then null;
end $$;

select cron.schedule('google-calendar-sync-daily', '40 3 * * *', $CRON$
  select net.http_post(
    url := 'https://wxatvxfirhahjalneorq.supabase.co/functions/v1/google-calendar-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_internal_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$CRON$);
