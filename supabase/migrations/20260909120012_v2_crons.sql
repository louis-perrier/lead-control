-- Crons V2 : dispatch chaque minute et refresh des tokens Instagram chaque nuit.
-- Le jeton d'appel vit dans Vault et n'apparaît jamais en clair dans cron.job.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cron_internal_token') then
    perform vault.create_secret(encode(gen_random_bytes(24), 'hex'), 'cron_internal_token');
  end if;
end $$;

select cron.schedule('assistant-dispatch-every-minute', '* * * * *', $CRON$
  select net.http_post(
    url := 'https://wxatvxfirhahjalneorq.supabase.co/functions/v1/assistant-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_internal_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$CRON$);

select cron.schedule('instagram-token-refresh-daily', '15 3 * * *', $CRON$
  select net.http_post(
    url := 'https://wxatvxfirhahjalneorq.supabase.co/functions/v1/instagram-token-refresh',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_internal_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$CRON$);
