insert into public.feature_flags (key, label, description, stage)
values (
  'sales_method',
  'Méthode de vente',
  'Les documents de méthode du client sont résumés en une fiche que l''assistant suit en priorité',
  'hidden'
)
on conflict (key) do nothing;
