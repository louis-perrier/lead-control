-- Gare la V1 dans un schéma legacy au lieu de la supprimer : rollback possible
-- tant que la V2 n'est pas validée. Sauvegarde aussi fonctions, policies et
-- crons V1 dans des tables legacy avant leur suppression du schéma public.

create schema if not exists legacy;

create table if not exists legacy._functions_v1_backup as
  select p.proname as name, pg_get_functiondef(p.oid) as definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_language l on l.oid = p.prolang
  where n.nspname = 'public' and l.lanname in ('plpgsql', 'sql');

create table if not exists legacy._policies_v1_backup as
  select * from pg_policies where schemaname in ('public', 'secrets');

-- Le trigger V1 d'inscription pointe sur public_profiles : il disparaît ici,
-- le trigger V2 (on_auth_user_created_v2) prend le relais seul.
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_deleted on auth.users;


do $$
declare t text;
begin
  foreach t in array array[
    'agents','user_agent','agent_configs','connectors','connectors_agent',
    'connectors_config_agent','all_connectors_users','conversation_memory',
    'conversation_messages','conversations','contacts','deal_closings',
    'calendly_bookings','human_followups','followup_sequences',
    'whatsapp_templates','wa_twilio_numbers','wa_sms_codes',
    'scrape_run_leads','scrape_runs','scrape_leads',
    'agent_config_context_chunks','agent_config_context_docs',
    'voice_call_events','voice_calls','voice_leads','voice_phone_numbers',
    'gmail_messages','gmail_sync_state','gmail_accounts','public_profiles'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I set schema legacy', t);
    end if;
  end loop;
end $$;

drop function if exists public.set_connectors_agent_provider() cascade;
drop function if exists public.set_connectors_agent_agent_name() cascade;
drop function if exists public.sync_all_connectors_users_from_token() cascade;
drop function if exists public.increment_credits_balance(uuid, integer);
drop function if exists public.validate_agent_schedule(jsonb) cascade;
drop function if exists public.trg_validate_agent_configs() cascade;
drop function if exists public.profiles_set_updated_at() cascade;
drop function if exists public.public_profiles_set_updated_at() cascade;
drop function if exists public.can_consume_one_credit(uuid);
drop function if exists public.consume_one_credit(uuid);
drop function if exists public.restitute_one_credit(uuid);
drop function if exists public.bump_conversation_inbound(bigint, timestamptz, text);
drop function if exists public.bump_conversation_human_sent(bigint, timestamptz, text);
drop function if exists public.schedule_conversation_debounce(bigint, timestamptz, timestamptz, text);
drop function if exists public.dispatch_scheduled_replies(integer);
drop function if exists public.match_agent_config_context(uuid, vector, integer);
drop function if exists public.check_voice_phone_number_user_coherence() cascade;
