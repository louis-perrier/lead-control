-- Dernier message écrit par le prospect : c'est lui qui ouvre les fenêtres Instagram de 24 h
-- et de 7 jours, nos propres envois ne les prolongent jamais.
alter table public.conversations
  add column if not exists last_customer_message_at timestamptz;

create or replace function public.track_last_customer_message()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.conversations
     set last_customer_message_at = greatest(coalesce(last_customer_message_at, new.sent_at), new.sent_at)
   where id = new.conversation_id;
  return new;
end $$;

revoke all on function public.track_last_customer_message() from public, anon, authenticated;

drop trigger if exists trg_track_last_customer_message on public.conversation_messages;
create trigger trg_track_last_customer_message
  after insert on public.conversation_messages
  for each row
  when (new.author_type = 'customer')
  execute function public.track_last_customer_message();

update public.conversations c
   set last_customer_message_at = m.last_at
  from (
    select conversation_id, max(sent_at) as last_at
      from public.conversation_messages
     where author_type = 'customer'
     group by conversation_id
  ) m
 where m.conversation_id = c.id
   and c.last_customer_message_at is distinct from m.last_at;

create index if not exists conversations_last_customer_message_idx
  on public.conversations (user_id, last_customer_message_at desc);
