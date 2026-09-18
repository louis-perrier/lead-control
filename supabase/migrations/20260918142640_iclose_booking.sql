-- Prise de rendez-vous dans iClose : l'agent réserve lui-même par l'API, et le webhook iClose
-- rattrape les réservations que le prospect fait depuis le lien. Les réservations iClose
-- partagent la table bookings avec Calendly et Google.

alter table public.channel_accounts drop constraint if exists channel_accounts_provider_check;
alter table public.channel_accounts add constraint channel_accounts_provider_check
  check (provider in ('instagram', 'whatsapp', 'calendly', 'gmail', 'google', 'iclose'));

alter table public.bookings drop constraint if exists bookings_provider_check;
alter table public.bookings add constraint bookings_provider_check
  check (provider in ('calendly', 'google', 'iclose'));

-- Un seul appel iClose actif par conversation, comme pour les deux autres. Le contrôle préalable
-- évite une erreur d'index illisible sur une base qui porterait déjà des doublons.
do $$
declare v_dup bigint;
begin
  select count(*) into v_dup from (
    select conversation_id
    from public.bookings
    where provider = 'iclose' and status = 'active' and conversation_id is not null
    group by conversation_id
    having count(*) > 1
  ) d;
  if v_dup > 0 then
    raise exception 'Migration arretee : % conversation(s) portent plusieurs reservations iClose actives. Les clore avant de rejouer.', v_dup;
  end if;
end $$;

create unique index if not exists bookings_iclose_active_conversation_key
  on public.bookings (conversation_id) where provider = 'iclose' and status = 'active';

insert into public.feature_flags (key, label, description, stage)
values (
  'iclose_booking',
  'Rendez-vous iClose',
  'L''agent propose des créneaux et réserve l''appel sur la page iClose choisie',
  'hidden'
)
on conflict (key) do nothing;

-- Une réservation iClose ferme la conversation comme une réservation Calendly ou Google :
-- les relances en attente doivent s'annuler de la même façon.
drop trigger if exists trg_followups_cancel_on_state on public.conversations;
create trigger trg_followups_cancel_on_state
after update of automation_state on public.conversations
for each row when (
  new.automation_state is distinct from old.automation_state
  and (
    new.automation_state in ('stopped', 'error')
    or (
      new.automation_state = 'condition_stop'
      and new.automation_reason in ('calendly_booked', 'calendar_booked', 'iclose_booked')
    )
  )
)
execute function public.followups_cancel_on_state();

-- Deux pannes iClose méritent une notification de compte, pas une par conversation.
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
  elsif v_code = 'calendly_token_expired' then
    v_key := 'code:calendly';
    v_body := 'Calendly à reconnecter';
  elsif v_code = 'calendly_plan_required' then
    v_key := 'code:calendly';
    v_body := 'Forfait Calendly trop limité pour réserver';
  elsif v_code = 'iclose_token_invalid' then
    v_key := 'code:iclose';
    v_body := 'Clé iClose à refaire';
  elsif v_code = 'iclose_plan_required' then
    v_key := 'code:iclose';
    v_body := 'Forfait iClose trop limité pour réserver';
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
