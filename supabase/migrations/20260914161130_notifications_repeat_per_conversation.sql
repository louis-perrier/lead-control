-- Une conversation ne repasse en erreur qu'après avoir été reprise : c'est un nouvel événement.
-- L'ancienne notification non lue est close et une nouvelle est créée, ce qui relance le push.
-- Les blocages du compte gardent une seule notification mise à jour, sans push répété.
create or replace function public.notify_conversation_error()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_code text := coalesce(new.last_error_code, new.automation_reason, '');
  v_kind text := 'blocked';
  v_key text := 'conv:' || new.id || ':blocked';
  v_body text;
begin
  if v_code in ('notify_human', 'model_output_unreadable', 'no_reply') then
    v_kind := 'needs_you';
    v_key := 'conv:' || new.id;
    v_body := split_part(coalesce(nullif(trim(new.last_error_message), ''), 'L''assistant a besoin de vous sur cette conversation.'), '. ', 1);
  elsif v_code in ('channel_token_missing', 'channel_missing') then
    v_key := 'code:channel';
    v_body := 'Instagram à reconnecter';
  elsif v_code = 'no_credits_left' then
    v_key := 'code:' || v_code;
    v_body := 'Crédits épuisés';
  elsif v_code = 'no_active_subscription' then
    v_key := 'code:' || v_code;
    v_body := 'Abonnement inactif';
  elsif v_code in ('missing_api_key', 'invalid_api_key') then
    v_key := 'code:api_key';
    v_body := 'Clé API à vérifier';
  elsif v_code = 'send_failed' then
    v_body := 'Envoi Instagram refusé';
  elsif v_code in ('ai_error', 'dispatch_error') then
    v_body := 'Erreur technique';
  else
    v_body := coalesce(nullif(trim(new.last_error_message), ''), 'L''assistant est arrêté sur cette conversation.');
  end if;

  begin
    if v_key like 'conv:%' then
      update public.notifications
      set read_at = now()
      where user_id = new.user_id and dedupe_key = v_key and read_at is null;
    end if;
    insert into public.notifications (user_id, conversation_id, kind, body, dedupe_key)
    values (new.user_id, new.id, v_kind, left(v_body, 120), v_key)
    on conflict (user_id, dedupe_key) where read_at is null
    do update set body = excluded.body, conversation_id = excluded.conversation_id, created_at = now();
  exception when others then
    null;
  end;
  return new;
end $$;

revoke all on function public.notify_conversation_error() from public, anon, authenticated;
