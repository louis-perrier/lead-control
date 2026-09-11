-- Réveille la table followups posée en sommeil par la refonte V2.
-- La planification et la réservation passent par des RPC transactionnelles : entre l'envoi
-- d'une réponse et la création des relances, le prospect peut répondre, et seul un verrou
-- de ligne empêche de programmer des relances sur une conversation déjà relancée par lui.
-- Le contenu n'est pas figé ici, il est relu dans assistants.settings au moment de l'envoi.

alter table public.followups
  add column if not exists assistant_id uuid references public.assistants (id) on delete cascade,
  add column if not exists slot_index smallint not null default 1,
  add column if not exists anchor_message_id bigint references public.conversation_messages (id) on delete cascade,
  add column if not exists message_id bigint references public.conversation_messages (id) on delete set null,
  add column if not exists kind text,
  add column if not exists media_path text,
  add column if not exists media_mime text,
  add column if not exists external_message_id text,
  add column if not exists skip_reason text,
  add column if not exists error_message text,
  add column if not exists locked_at timestamptz,
  add column if not exists attempts smallint not null default 0,
  add column if not exists updated_at timestamptz not null default now();

alter table public.followups drop constraint if exists followups_status_check;
alter table public.followups add constraint followups_status_check
  check (status in ('pending', 'sending', 'sent', 'skipped', 'cancelled'));

alter table public.followups drop constraint if exists followups_kind_check;
alter table public.followups add constraint followups_kind_check
  check (kind is null or kind in ('text', 'audio'));

alter table public.followups drop constraint if exists followups_provider_check;
alter table public.followups add constraint followups_provider_check
  check (provider in ('instagram', 'whatsapp', 'gmail'));

drop trigger if exists trg_followups_updated_at on public.followups;
create trigger trg_followups_updated_at
before update on public.followups
for each row execute function public.set_updated_at();

-- Seul garde-fou dur contre un rejeu de la planification.
create unique index if not exists followups_auto_slot_uniq
  on public.followups (conversation_id, anchor_message_id, slot_index)
  where created_by = 'auto';

create index if not exists followups_open_idx
  on public.followups (conversation_id)
  where status in ('pending', 'sending');
create index if not exists followups_pending_due_idx
  on public.followups (scheduled_at)
  where status = 'pending';

-- La règle des 24 h était écrite en TypeScript dans messages-send et dans l'inbox.
-- Elle vit désormais ici, pour que les trois appelants ne puissent plus diverger.
create or replace function public.conversation_window_closes_at(p_conversation_id bigint)
returns timestamptz
language sql stable security definer set search_path = public, pg_temp as $$
  select max(m.sent_at) + interval '24 hours'
    from public.conversation_messages m
   where m.conversation_id = p_conversation_id
     and m.author_type = 'customer';
$$;

create or replace function public.plan_followups(
  p_conversation_id bigint,
  p_assistant_id uuid,
  p_anchor_message_id bigint,
  p_slots jsonb
)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_state text;
  v_heat text;
  v_user uuid;
  v_contact uuid;
  v_anchor_at timestamptz;
  v_slot jsonb;
  v_count integer := 0;
begin
  if p_assistant_id is null or p_anchor_message_id is null or jsonb_typeof(p_slots) <> 'array' then
    return 0;
  end if;

  select c.automation_state, c.heat_tag, c.user_id, c.contact_id
    into v_state, v_heat, v_user, v_contact
    from public.conversations c
   where c.id = p_conversation_id
     for update;
  if not found or v_state not in ('idle', 'condition_stop') or v_heat = 'cold' then
    return 0;
  end if;

  select m.sent_at into v_anchor_at
    from public.conversation_messages m
   where m.id = p_anchor_message_id;
  if v_anchor_at is null then
    return 0;
  end if;

  if exists (
    select 1 from public.conversation_messages m
     where m.conversation_id = p_conversation_id
       and m.author_type = 'customer'
       and m.id > p_anchor_message_id
  ) then
    return 0;
  end if;

  update public.followups
     set status = 'cancelled', skip_reason = 'replanned'
   where conversation_id = p_conversation_id
     and status = 'pending';

  for v_slot in select * from jsonb_array_elements(p_slots) loop
    begin
      insert into public.followups (
        user_id, conversation_id, assistant_id, contact_id, provider,
        slot_index, anchor_message_id, scheduled_at, status, created_by
      ) values (
        v_user, p_conversation_id, p_assistant_id, v_contact, 'instagram',
        (v_slot->>'slot')::smallint, p_anchor_message_id,
        v_anchor_at + make_interval(mins => (v_slot->>'delay_minutes')::int),
        'pending', 'auto'
      );
      v_count := v_count + 1;
    exception when unique_violation then
      null;
    end;
  end loop;
  return v_count;
end $$;

-- Réservation : le passage en 'sending' est ce qui tient pendant l'appel HTTP, le verrou
-- de ligne ne survit pas à la transaction. Une ligne bloquée plus de 10 minutes est reprise.
create or replace function public.dispatch_due_followups(p_limit integer)
returns table (
  id uuid,
  user_id uuid,
  conversation_id bigint,
  assistant_id uuid,
  slot_index smallint,
  message_id bigint,
  attempts smallint
)
language sql security definer set search_path = public, pg_temp as $$
  with picked as (
    select f.id
      from public.followups f
     where (
             (f.status = 'pending' and f.scheduled_at <= now())
             or (f.status = 'sending' and f.locked_at < now() - interval '10 minutes')
           )
       and not exists (
         select 1 from public.followups older
          where older.conversation_id = f.conversation_id
            and older.slot_index < f.slot_index
            and older.status in ('pending', 'sending')
       )
     order by f.scheduled_at asc
     limit greatest(coalesce(p_limit, 20), 1)
       for update skip locked
  )
  update public.followups f
     set status = 'sending', locked_at = now(), attempts = f.attempts + 1
    from picked
   where f.id = picked.id
  returning f.id, f.user_id, f.conversation_id, f.assistant_id, f.slot_index, f.message_id, f.attempts;
$$;

create or replace function public.cancel_conversation_followups(p_conversation_id bigint)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_owner uuid;
  v_count integer;
begin
  select user_id into v_owner from public.conversations where id = p_conversation_id;
  if v_owner is null or (v_owner <> auth.uid() and not public.is_admin_or_owner()) then
    return 0;
  end if;
  update public.followups
     set status = 'cancelled', skip_reason = 'cancelled_by_user'
   where conversation_id = p_conversation_id
     and status = 'pending';
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create or replace function public.followups_cancel_on_inbound()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.followups
     set status = 'cancelled', skip_reason = 'customer_replied'
   where conversation_id = new.conversation_id
     and status = 'pending';
  return null;
end $$;

drop trigger if exists trg_followups_cancel_on_inbound on public.conversation_messages;
create trigger trg_followups_cancel_on_inbound
after insert on public.conversation_messages
for each row when (new.direction = 'in' and new.author_type = 'customer')
execute function public.followups_cancel_on_inbound();

-- La prise de main et la clôture sont écrites depuis le navigateur, sans passer par une
-- Edge Function : ce trigger est le seul point où l'annulation est garantie.
create or replace function public.followups_cancel_on_state()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.followups
     set status = 'cancelled', skip_reason = 'conversation_' || new.automation_state
   where conversation_id = new.id
     and status = 'pending';
  return null;
end $$;

drop trigger if exists trg_followups_cancel_on_state on public.conversations;
create trigger trg_followups_cancel_on_state
after update of automation_state on public.conversations
for each row when (
  new.automation_state is distinct from old.automation_state
  and new.automation_state in ('stopped', 'error')
)
execute function public.followups_cancel_on_state();

create or replace function public.followups_cancel_on_assistant_off()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.followups f
     set status = 'cancelled', skip_reason = 'agent_inactive'
   where f.assistant_id = new.id
     and f.status = 'pending';
  return null;
end $$;

drop trigger if exists trg_followups_cancel_on_assistant_off on public.assistants;
create trigger trg_followups_cancel_on_assistant_off
after update of is_active on public.assistants
for each row when (old.is_active and not new.is_active)
execute function public.followups_cancel_on_assistant_off();

-- Une relance est créée et envoyée par la plateforme : le client la lit et l'annule,
-- il ne l'écrit jamais, sans quoi il pourrait faire envoyer un texte arbitraire en son nom.
drop policy if exists followups_all on public.followups;
create policy followups_select on public.followups
  for select to authenticated
  using (user_id = auth.uid());

revoke all on function public.plan_followups(bigint, uuid, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.plan_followups(bigint, uuid, bigint, jsonb) to service_role;
revoke all on function public.dispatch_due_followups(integer) from public, anon, authenticated;
grant execute on function public.dispatch_due_followups(integer) to service_role;
revoke all on function public.cancel_conversation_followups(bigint) from public, anon;
grant execute on function public.cancel_conversation_followups(bigint) to authenticated, service_role;
revoke all on function public.conversation_window_closes_at(bigint) from public, anon;
grant execute on function public.conversation_window_closes_at(bigint) to authenticated, service_role;

-- Un vocal de relance ne vit pas dans ig-audio : la colonne dit où chercher le fichier,
-- sinon media-signed-url signe dans le mauvais bucket et l'écoute renvoie une URL morte.
alter table public.conversation_messages
  add column if not exists media_bucket text;

insert into storage.buckets (id, name, public)
values ('assistant-audio', 'assistant-audio', false)
on conflict (id) do nothing;

drop policy if exists assistant_audio_storage_insert on storage.objects;
create policy assistant_audio_storage_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'assistant-audio' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists assistant_audio_storage_select on storage.objects;
create policy assistant_audio_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'assistant-audio' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff()));
drop policy if exists assistant_audio_storage_delete on storage.objects;
create policy assistant_audio_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'assistant-audio' and (storage.foldername(name))[1] = auth.uid()::text);

insert into public.feature_flags (key, label, description, stage)
values ('canned_responses', 'Réponses préenregistrées', 'Répond à une question récurrente par un texte ou un vocal du coach', 'hidden')
on conflict (key) do nothing;

do $$
begin
  perform cron.unschedule('followups-dispatch-every-minute');
exception when others then null;
end $$;

select cron.schedule('followups-dispatch-every-minute', '* * * * *', $CRON$
  select net.http_post(
    url := 'https://wxatvxfirhahjalneorq.supabase.co/functions/v1/followups-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_internal_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$CRON$);
