insert into public.feature_flags (key, label, description, stage)
values (
  'discovery_flow',
  'Déroulé de découverte',
  'L''assistant cherche la douleur du prospect en quatre temps et peut envoyer une ressource avant de proposer l''appel',
  'hidden'
)
on conflict (key) do nothing;
