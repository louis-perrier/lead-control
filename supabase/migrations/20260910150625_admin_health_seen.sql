create table public.admin_health_seen (
  user_id uuid primary key references public.profiles (user_id) on delete cascade,
  seen_at timestamptz not null default now()
);

alter table public.admin_health_seen enable row level security;

create policy admin_health_seen_all on public.admin_health_seen
  for all
  using (user_id = auth.uid() and public.is_staff())
  with check (user_id = auth.uid() and public.is_staff());

create or replace function public.mark_health_seen()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_staff() then
    raise exception 'accès refusé';
  end if;
  insert into public.admin_health_seen (user_id, seen_at)
  values (auth.uid(), now())
  on conflict (user_id) do update set seen_at = now();
end
$$;

revoke all on function public.mark_health_seen() from public, anon;
grant execute on function public.mark_health_seen() to authenticated;
