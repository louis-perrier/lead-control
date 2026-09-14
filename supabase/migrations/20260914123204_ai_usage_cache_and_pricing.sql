-- Tokens écrits en cache, facturés au-dessus du prix d'entrée.
alter table public.ai_usage
  add column if not exists cache_creation_tokens integer not null default 0;

-- Les estimations passées reposaient sur un tarif erroné (Sonnet 5 à 3 $ / 15 $,
-- Haiku 4.5 à 0,80 $ / 4 $). Recalcul au tarif public : 2 $ / 10 $ et 1 $ / 5 $.
update public.ai_usage
   set cost_estimate_usd = (input_tokens * 2 + cache_read_tokens * 0.2 + output_tokens * 10) / 1000000.0
 where model = 'claude-sonnet-5';

update public.ai_usage
   set cost_estimate_usd = (input_tokens * 1 + cache_read_tokens * 0.1 + output_tokens * 5) / 1000000.0
 where model = 'claude-haiku-4-5-20251001';
