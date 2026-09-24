-- pg_cron ne purge jamais son historique : deux tâches à la minute y écrivent près de 90 000
-- lignes par mois, et le forfait Free bloque le projet en lecture seule à 500 Mo.

do $$
begin
  perform cron.unschedule('cron-history-purge-daily');
exception when others then null;
end $$;

select cron.schedule('cron-history-purge-daily', '20 4 * * *', $CRON$
  delete from cron.job_run_details where end_time < now() - interval '7 days'
$CRON$);
