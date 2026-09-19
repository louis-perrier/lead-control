insert into public.feature_flags (key, label, description, stage)
values (
  'ignore_solicitors',
  'Ignorer les démarcheurs',
  'L''assistant ne répond pas à quelqu''un qui écrit pour vendre sa propre offre',
  'hidden'
)
on conflict (key) do nothing;
