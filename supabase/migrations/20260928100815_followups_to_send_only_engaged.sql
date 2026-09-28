-- « Relancer seulement les personnes qui m'ont déjà écrit » : une relance notifiée avant que la
-- case soit cochée ne doit plus s'afficher « à envoyer » sur une conversation où le prospect
-- n'a jamais écrit. Même vue qu'avant, une condition en plus.
create or replace view public.v_followups_to_send
with (security_invoker = true) as
select f.id, f.user_id, f.conversation_id, f.assistant_id, f.item_id, f.variant_id, f.message_body, f.sent_at
  from public.followups f
  join public.conversations c on c.id = f.conversation_id
  left join public.assistants a on a.id = coalesce(f.assistant_id, c.assistant_id)
 where f.status = 'notified'
   and f.sent_at > coalesce(c.last_customer_message_at, '-infinity'::timestamptz)
   and c.outcome is null
   and not (
     c.last_customer_message_at is null
     and coalesce((a.settings->'followups'->>'only_engaged')::boolean, false)
   )
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
