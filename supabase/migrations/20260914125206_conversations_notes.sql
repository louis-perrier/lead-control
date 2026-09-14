-- Notes privées du coach sur un prospect, affichées dans la page Prospects. Écrites par le
-- propriétaire via la policy conversations_update existante.
alter table public.conversations
  add column if not exists notes text;
