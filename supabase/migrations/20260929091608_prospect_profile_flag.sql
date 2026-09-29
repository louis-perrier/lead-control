insert into public.feature_flags (key, label, description, stage)
values (
  'prospect_profile',
  'Profil du prospect',
  'L''assistant connaît le nombre d''abonnés Instagram du prospect, arrondi, sans en déduire qu''il crée du contenu',
  'hidden'
)
on conflict (key) do nothing;
