-- Message Slack à chaque appel réservé. Le déclencheur est posé sur bookings et non dans le code :
-- l'assistant, les deux webhooks et le mode lien écrivent tous dans cette table, un seul point
-- couvre donc les quatre chemins.

alter table public.channel_accounts drop constraint if exists channel_accounts_provider_check;
alter table public.channel_accounts add constraint channel_accounts_provider_check
  check (provider in ('instagram', 'whatsapp', 'calendly', 'gmail', 'google', 'iclose', 'slack'));

insert into public.feature_flags (key, label, description, stage)
values (
  'slack_notifications',
  'Notifications Slack',
  'Un message part dans le canal Slack choisi dès qu''un appel est réservé',
  'hidden'
)
on conflict (key) do nothing;

-- Une réservation annulée puis rejouée ne repasse pas ici : seul un insert déclenche le message.
create or replace function public.notify_booking_slack()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status is distinct from 'active' then
    return new;
  end if;
  if not exists (
    select 1 from public.channel_accounts
    where user_id = new.user_id and provider = 'slack' and status = 'connected'
  ) then
    return new;
  end if;
  begin
    perform net.http_post(
      url := 'https://wxatvxfirhahjalneorq.supabase.co/functions/v1/slack-notify',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_internal_token')
      ),
      body := jsonb_build_object('booking_id', new.id),
      timeout_milliseconds := 10000
    );
  exception when others then
    null;
  end;
  return new;
end $$;

revoke all on function public.notify_booking_slack() from public, anon, authenticated;

drop trigger if exists bookings_notify_slack on public.bookings;
create trigger bookings_notify_slack
  after insert on public.bookings
  for each row
  execute function public.notify_booking_slack();
