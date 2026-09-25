-- Appels réservés : une ligne de bookings par réservation créée, tous outils confondus.
-- Une annulation ne retire rien, le compteur ne redescend jamais.
create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare v jsonb;
begin
  if not public.is_staff() then
    raise exception 'accès refusé';
  end if;
  select jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'active_subscriptions', (select count(*) from public.paiement_subscriptions where status in ('active', 'trialing')),
    'mrr_eur', (select coalesce(sum(700 + greatest(agents_settings_qty - 1, 0) * 60), 0)
                from public.paiement_subscriptions where status in ('active', 'trialing')),
    'assistants_active', (select count(*) from public.assistants where is_active),
    'conversations', (select count(*) from public.conversations),
    'messages_24h', (select count(*) from public.conversation_messages where sent_at > now() - interval '24 hours'),
    'agent_replies_24h', (select count(*) from public.conversation_messages
                          where author_type = 'agent' and sent_at > now() - interval '24 hours'),
    'errors_24h', (select count(*) from public.system_events
                   where level = 'error' and created_at > now() - interval '24 hours'),
    'ai_cost_month_usd', (select coalesce(sum(cost_estimate_usd), 0) from public.ai_usage
                          where created_at > date_trunc('month', now())),
    'expired_channels', (select count(*) from public.channel_accounts where status = 'expired' and provider = 'instagram'),
    'bookings_total', (select count(*) from public.bookings),
    'bookings_30d', (select count(*) from public.bookings where created_at > now() - interval '30 days')
  ) into v;
  return v;
end $$;

revoke all on function public.admin_dashboard_stats() from public, anon;
grant execute on function public.admin_dashboard_stats() to authenticated, service_role;
