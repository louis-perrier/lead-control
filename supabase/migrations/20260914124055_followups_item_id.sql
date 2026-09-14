-- Chaque relance planifiée garde l'id de la relance réglée par le coach : la position dans
-- la liste changeait de sens dès qu'il en modifiait une.
alter table public.followups
  add column if not exists item_id text;

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

revoke all on function public.plan_followups(bigint, uuid, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.plan_followups(bigint, uuid, bigint, jsonb) to service_role;
