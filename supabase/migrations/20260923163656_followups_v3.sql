-- Relances en séquence d'étapes : like, message (texte, vocal, image), notification au coach
-- au-delà de la fenêtre Meta. Trace de la variante envoyée pour mesurer le taux de réponse.

alter table public.followups drop constraint if exists followups_kind_check;
alter table public.followups add constraint followups_kind_check
  check (kind is null or kind in ('text', 'audio', 'image', 'like', 'notify'));

-- notified : le texte a été proposé au coach, rien n'est parti vers le prospect.
alter table public.followups drop constraint if exists followups_status_check;
alter table public.followups add constraint followups_status_check
  check (status in ('pending', 'sending', 'sent', 'notified', 'skipped', 'cancelled'));

alter table public.followups add column if not exists variant_id text;

create index if not exists followups_stats_idx
  on public.followups (assistant_id, sent_at)
  where status in ('sent', 'notified');

-- Même fonction qu'avant, à une ligne près : une étape planifiée après un report ne part
-- jamais dans la même minute que celle qui vient de partir.
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
        slot_index, item_id, anchor_message_id, scheduled_at, status, created_by
      ) values (
        v_user, p_conversation_id, p_assistant_id, v_contact, 'instagram',
        (v_slot->>'slot')::smallint, nullif(v_slot->>'item_id', ''), p_anchor_message_id,
        greatest(v_anchor_at + make_interval(mins => (v_slot->>'delay_minutes')::int), now() + interval '5 minutes'),
        'pending', 'auto'
      );
      v_count := v_count + 1;
    exception when unique_violation then
      null;
    end;
  end loop;
  return v_count;
end $$;

revoke all on function public.plan_followups(bigint, uuid, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.plan_followups(bigint, uuid, bigint, jsonb) to service_role;

-- Envois et réponses par variante. Une réponse : un message du prospect après l'envoi et avant
-- l'étape suivante réellement partie, ou dans les 48 h à défaut.
create or replace function public.followup_variant_stats(p_assistant_id uuid, p_since timestamptz)
returns table (step_id text, variant_id text, sent bigint, replied bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  with rows as (
    select f.conversation_id, f.item_id, f.variant_id, f.sent_at, f.kind,
           lead(f.sent_at) over (partition by f.conversation_id order by f.sent_at) as next_at
      from public.followups f
     where f.assistant_id = p_assistant_id
       and f.status in ('sent', 'notified')
       and f.sent_at is not null
       and f.sent_at >= p_since
  )
  select r.item_id, r.variant_id, count(*)::bigint,
         count(*) filter (
           where exists (
             select 1 from public.conversation_messages m
              where m.conversation_id = r.conversation_id
                and m.author_type = 'customer'
                and m.sent_at > r.sent_at
                and m.sent_at <= least(coalesce(r.next_at, r.sent_at + interval '48 hours'), r.sent_at + interval '48 hours')
           )
         )::bigint
    from rows r
   where r.kind in ('text', 'audio', 'image')
     and exists (
       select 1 from public.assistants a
        where a.id = p_assistant_id
          and (a.user_id = auth.uid() or public.is_admin_or_owner())
     )
   group by 1, 2;
$$;
revoke all on function public.followup_variant_stats(uuid, timestamptz) from public, anon;
grant execute on function public.followup_variant_stats(uuid, timestamptz) to authenticated, service_role;

-- Relances proposées au coach et pas encore envoyées : la seule définition de « à envoyer »,
-- lue par la boîte, le fil et Prospects. Un message sortant postérieur (écho Instagram compris)
-- ou un « Ne pas relancer » la retire.
create or replace view public.v_followups_to_send
with (security_invoker = true) as
select f.id, f.user_id, f.conversation_id, f.assistant_id, f.item_id, f.variant_id, f.message_body, f.sent_at
  from public.followups f
  join public.conversations c on c.id = f.conversation_id
 where f.status = 'notified'
   and f.sent_at > coalesce(c.last_customer_message_at, '-infinity'::timestamptz)
   and c.outcome is null
   and not exists (
     select 1 from public.conversation_messages m
      where m.conversation_id = f.conversation_id
        and m.direction = 'out'
        and m.sent_at > f.sent_at
   )
   and (
     c.metadata->>'assisted_dismissed_at' is null
     or (c.metadata->>'assisted_dismissed_at')::timestamptz < f.sent_at
   );
grant select on public.v_followups_to_send to authenticated, service_role;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('needs_you', 'blocked', 'followup'));

-- Images de relance. Le bucket audio ne bouge pas, son nom est codé par plusieurs fonctions.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('assistant-media', 'assistant-media', false, 8388608, array['image/jpeg', 'image/png', 'image/gif'])
on conflict (id) do nothing;

drop policy if exists assistant_media_storage_insert on storage.objects;
create policy assistant_media_storage_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'assistant-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists assistant_media_storage_select on storage.objects;
create policy assistant_media_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'assistant-media' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff()));
drop policy if exists assistant_media_storage_delete on storage.objects;
create policy assistant_media_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'assistant-media' and (storage.foldername(name))[1] = auth.uid()::text);
