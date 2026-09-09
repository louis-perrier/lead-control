-- Arrêt immédiat des 4 crons V1 : dispatch n8n, refresh cassé, relances en 404
-- et surtout l'endpoint public twilio-auto-purchase qui dépense de l'argent.

create schema if not exists legacy;

create table if not exists legacy._cron_v1_backup as
  select jobid, schedule, command, jobname from cron.job;

do $$
declare j record;
begin
  for j in
    select jobid from cron.job
    where jobname in (
      'dispatch-scheduled-replies-every-minute',
      'token-refresh-daily',
      'trigger-auto-create-followups',
      'twilio-auto-purchase-hourly'
    )
  loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;
