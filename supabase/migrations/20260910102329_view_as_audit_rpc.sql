create or replace function public.admin_enter_view_as(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
begin
  if not public.is_staff() then
    raise exception 'accès refusé';
  end if;

  select role into v_role from public.profiles where user_id = p_user;
  if v_role is null then
    raise exception 'utilisateur introuvable';
  end if;
  if v_role <> 'user' then
    raise exception 'voir comme n''est possible que pour un compte client';
  end if;

  perform public.log_admin_action('enter_view_as', p_user, '{}'::jsonb);
end;
$$;

revoke all on function public.admin_enter_view_as(uuid) from public, anon;
grant execute on function public.admin_enter_view_as(uuid) to authenticated, service_role;
