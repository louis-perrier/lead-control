alter table public.profiles add column if not exists plan_override_since timestamptz;
update public.profiles set plan_override_since = updated_at where plan_override is not null and plan_override_since is null;

create or replace function public.admin_set_plan_override(p_user uuid, p_override text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_current text;
begin
  if not public.is_admin_or_owner() then
    raise exception 'accès refusé';
  end if;
  if p_override is not null and p_override not in ('beta_byok', 'free_unlimited') then
    raise exception 'override invalide';
  end if;
  select plan_override into v_current from public.profiles where user_id = p_user;
  update public.profiles
    set plan_override = p_override,
        plan_override_since = case when v_current is distinct from p_override then now() else plan_override_since end,
        updated_at = now()
    where user_id = p_user;
  perform public.log_admin_action('set_plan_override', p_user, jsonb_build_object('override', p_override));
end $$;
