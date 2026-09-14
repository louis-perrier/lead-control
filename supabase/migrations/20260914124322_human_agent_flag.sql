-- Réponse manuelle jusqu'à 7 jours (tag HUMAN_AGENT de Meta) : livrée masquée, à ouvrir
-- depuis Admin > Modules le jour où Meta valide la fonctionnalité.
insert into public.feature_flags (key, label, description, stage)
values ('human_agent', 'Human Agent', 'Répondre à la main et relancer en un clic jusqu''à 7 jours après le dernier message du prospect', 'hidden')
on conflict (key) do nothing;

-- Même règle que lib/features.ts, pour les fonctions qui doivent la vérifier côté serveur.
create or replace function public.user_has_feature(p_user uuid, p_key text)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select o.enabled from public.user_feature_overrides o where o.user_id = p_user and o.key = p_key),
    (select case f.stage
              when 'all' then true
              when 'beta' then exists (
                select 1 from public.profiles p
                 where p.user_id = p_user and (p.role in ('viewer', 'admin', 'owner') or p.plan_override = 'beta_byok'))
              when 'staff' then exists (
                select 1 from public.profiles p
                 where p.user_id = p_user and p.role in ('viewer', 'admin', 'owner'))
              else false
            end
       from public.feature_flags f
      where f.key = p_key),
    false
  );
$$;

revoke all on function public.user_has_feature(uuid, text) from public, anon, authenticated;
grant execute on function public.user_has_feature(uuid, text) to service_role;
