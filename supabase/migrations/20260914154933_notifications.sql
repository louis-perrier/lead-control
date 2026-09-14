-- Notifications : une ligne quand une conversation passe en erreur (l'assistant passe la main
-- ou est bloqué), et un envoi Web Push vers les téléphones abonnés. Aucune étape ne doit faire
-- échouer la mise à jour de la conversation qui la déclenche.

create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id bigint references public.conversations (id) on delete cascade,
  kind text not null check (kind in ('needs_you', 'blocked')),
  body text not null,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

-- Une seule notification non lue par conversation (ou par blocage du compte).
create unique index if not exists notifications_unread_key
  on public.notifications (user_id, dedupe_key) where read_at is null;
create index if not exists notifications_user_recent
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = auth.uid());
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz
);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
revoke all on public.push_subscriptions from anon, authenticated;
grant select on public.push_subscriptions to authenticated;

-- Un même navigateur peut passer d'un compte à l'autre : l'adresse d'envoi change de propriétaire.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then
    raise exception 'non authentifié';
  end if;
  if p_endpoint !~ '^https://' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'abonnement invalide';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = now();
end $$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = public, pg_temp as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
revoke all on function public.delete_push_subscription(text) from public, anon;
grant execute on function public.delete_push_subscription(text) to authenticated;

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
    insert into public.notifications (user_id, conversation_id, kind, body, dedupe_key)
    values (new.user_id, new.id, v_kind, left(v_body, 120), v_key)
    on conflict (user_id, dedupe_key) where read_at is null
    do update set body = excluded.body, conversation_id = excluded.conversation_id, created_at = now();
  exception when others then
    null;
  end;
  return new;
end $$;

drop trigger if exists conversations_notify_error on public.conversations;
create trigger conversations_notify_error
  after update of automation_state on public.conversations
  for each row
  when (new.automation_state = 'error' and old.automation_state is distinct from 'error')
  execute function public.notify_conversation_error();

-- Une mise à jour sur conflit ne repasse pas ici : pas de second push pour la même notification.
create or replace function public.push_new_notification()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.push_subscriptions where user_id = new.user_id) then
    begin
      perform net.http_post(
        url := 'https://wxatvxfirhahjalneorq.supabase.co/functions/v1/notifications-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_internal_token')
        ),
        body := jsonb_build_object('notification_id', new.id),
        timeout_milliseconds := 10000
      );
    exception when others then
      null;
    end;
  end if;
  return new;
end $$;

drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push
  after insert on public.notifications
  for each row execute function public.push_new_notification();

do $$
begin
  begin
    alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then null;
  end;
end $$;

insert into public.feature_flags (key, label, description, stage)
values ('notifications', 'Notifications', 'Cloche dans l''application et notifications sur le téléphone quand l''assistant a besoin de vous', 'staff')
on conflict (key) do nothing;
