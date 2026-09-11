create or replace function public.assistant_next_allowed_time(p_assistant_id uuid, p_at timestamp with time zone)
 returns timestamp with time zone
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_settings jsonb;
  v_tz text;
  v_always_on boolean;
  v_days jsonb;
  v_slots jsonb;
  v_start time;
  v_end time;
  v_day date;
  v_idx int;
  v_slot jsonb;
  v_win_start timestamptz;
  v_win_end timestamptz;
  v_best timestamptz;
  i int;
begin
  select a.settings, coalesce(p.timezone, 'Europe/Paris')
    into v_settings, v_tz
    from public.assistants a
    join public.profiles p on p.user_id = a.user_id
    where a.id = p_assistant_id;
  if v_settings is null then
    return p_at;
  end if;
  v_always_on := coalesce((v_settings->'schedule'->>'always_on')::boolean, false);
  if v_always_on then
    return p_at;
  end if;
  v_days := coalesce(v_settings->'schedule'->'days', '[true,true,true,true,true,true,true]'::jsonb);
  v_start := coalesce(nullif(v_settings->'schedule'->>'start', ''), '09:00')::time;
  v_end := coalesce(nullif(v_settings->'schedule'->>'end', ''), '20:00')::time;
  v_slots := v_settings->'schedule'->'slots';

  for i in 0..7 loop
    v_day := (p_at at time zone v_tz)::date + i;
    v_idx := extract(isodow from v_day)::int - 1;
    if coalesce((v_days->>v_idx)::boolean, true) then
      if jsonb_typeof(v_slots) = 'array' and jsonb_array_length(v_slots) > 0 then
        for v_slot in select * from jsonb_array_elements(v_slots) loop
          begin
            v_win_start := ((v_day + (v_slot->>'time')::time)::timestamp) at time zone v_tz;
            v_win_end := v_win_start + make_interval(mins => greatest(coalesce((v_slot->>'durationMinutes')::int, 30), 1));
          exception when others then
            continue;
          end;
          if p_at >= v_win_start and p_at < v_win_end then
            return p_at;
          elsif v_win_start > p_at and (v_best is null or v_win_start < v_best) then
            v_best := v_win_start;
          end if;
        end loop;
      else
        v_win_start := ((v_day + v_start)::timestamp) at time zone v_tz;
        v_win_end := ((v_day + v_end)::timestamp) at time zone v_tz;
        if p_at >= v_win_start and p_at < v_win_end then
          return p_at;
        elsif v_win_start > p_at and (v_best is null or v_win_start < v_best) then
          v_best := v_win_start;
        end if;
      end if;
    end if;
  end loop;
  return v_best;
end $function$;
