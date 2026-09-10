create index if not exists conv_msgs_agent_sent_idx
  on public.conversation_messages (sent_at) where author_type = 'agent';

create or replace function public.admin_message_usage_report(
  p_user uuid default null,
  p_since timestamptz default null,
  p_until timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_since timestamptz := coalesce(p_since, now() - interval '30 days');
  v_until timestamptz := coalesce(p_until, now());
  v jsonb;
begin
  if not public.is_staff() then
    raise exception 'accès refusé';
  end if;

  if p_user is not null then
    select jsonb_build_object(
      'total', coalesce(sum(cnt), 0),
      'by_assistant', coalesce(jsonb_agg(jsonb_build_object('assistant_id', assistant_id, 'count', cnt)), '[]'::jsonb)
    ) into v
    from (
      select c.assistant_id, count(*) as cnt
      from public.conversation_messages m
      join public.conversations c on c.id = m.conversation_id
      where m.author_type = 'agent'
        and m.sent_at >= v_since
        and m.sent_at < v_until
        and c.user_id = p_user
      group by c.assistant_id
    ) s;
  else
    select jsonb_build_object(
      'total', coalesce(sum(cnt), 0),
      'by_client', coalesce(
        (select jsonb_agg(jsonb_build_object('user_id', user_id, 'email', email, 'count', cnt))
         from (
           select user_id, email, cnt from (
             select c.user_id, p.email, count(*) as cnt
             from public.conversation_messages m
             join public.conversations c on c.id = m.conversation_id
             join public.profiles p on p.user_id = c.user_id
             where m.author_type = 'agent'
               and m.sent_at >= v_since
               and m.sent_at < v_until
             group by c.user_id, p.email
             order by count(*) desc
             limit 200
           ) t
         ) t2
        ),
        '[]'::jsonb
      )
    ) into v
    from (
      select c.user_id, count(*) as cnt
      from public.conversation_messages m
      join public.conversations c on c.id = m.conversation_id
      where m.author_type = 'agent'
        and m.sent_at >= v_since
        and m.sent_at < v_until
      group by c.user_id
    ) s;
  end if;

  return coalesce(v, jsonb_build_object('total', 0, 'by_client', '[]'::jsonb));
end;
$$;

revoke all on function public.admin_message_usage_report(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_message_usage_report(uuid, timestamptz, timestamptz) to authenticated, service_role;
