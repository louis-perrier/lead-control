-- La réservation d'une conversation commet son UPDATE avant que la réponse HTTP ne parte.
-- Quand cette réponse se perd, la conversation reste en 'pending' et plus rien ne la reprend,
-- donc le prospect n'a jamais de réponse. La reprise se fait ici plutôt que dans un cron à
-- part, comme pour les relances. Une conversation dont une bulle est déjà partie n'est jamais
-- rejouée : un second message identique chez le prospect coûte plus cher qu'une réponse perdue.

create or replace function public.dispatch_scheduled_replies(p_limit integer)
returns table (
  id bigint, user_id uuid, assistant_id uuid, channel_account_id uuid,
  provider text, external_thread_id text, contact_external_id text,
  pending_cursor_at timestamptz, pending_inbound_count integer
) language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  update public.conversations c
  set automation_state = 'idle',
      automation_reason = 'dispatch_interrupted',
      next_reply_at = null,
      debounce_until = null,
      pending_cursor_at = null,
      pending_since = null,
      pending_inbound_count = 0,
      is_processing = false,
      processing_started_at = null,
      updated_at = now()
  where c.automation_state = 'pending'
    and c.is_processing
    and c.processing_started_at < now() - interval '10 minutes'
    and exists (
      select 1
      from public.conversation_messages m
      where m.conversation_id = c.id
        and m.author_type = 'agent'
        and m.sent_at >= c.processing_started_at
    );

  update public.conversations c
  set automation_state = 'scheduled',
      automation_reason = 'dispatch_interrupted',
      next_reply_at = coalesce(c.next_reply_at, now()),
      debounce_until = null,
      is_processing = false,
      processing_started_at = null,
      updated_at = now()
  where c.automation_state = 'pending'
    and c.is_processing
    and c.processing_started_at < now() - interval '10 minutes';

  return query
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
  ),
  reserved as (
    update public.conversations c
    set automation_state = 'pending',
        is_processing = true,
        processing_started_at = now(),
        updated_at = now()
    from picked
    where c.id = picked.id
    returning c.id, c.user_id, c.assistant_id, c.channel_account_id,
      c.provider, c.external_thread_id, c.contact_external_id,
      c.pending_cursor_at, c.pending_inbound_count
  )
  select * from reserved;
end $$;

revoke execute on function public.dispatch_scheduled_replies(integer) from public, anon, authenticated;
grant execute on function public.dispatch_scheduled_replies(integer) to service_role;
