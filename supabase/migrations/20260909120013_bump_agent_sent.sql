-- Compteur de réponses de l'assistant, incrémenté par assistant-dispatch.

create or replace function public.bump_agent_sent(p_conversation_id bigint, p_count integer)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.conversations
  set agent_sent_count = agent_sent_count + greatest(p_count, 0)
  where id = p_conversation_id;
$$;

revoke all on function public.bump_agent_sent(bigint, integer) from public, anon, authenticated;
grant execute on function public.bump_agent_sent(bigint, integer) to service_role;
