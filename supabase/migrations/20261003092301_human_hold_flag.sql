insert into public.feature_flags (key, label, description, stage)
values (
  'human_hold',
  'Reprise après un message écrit à la main',
  'Le client règle combien de temps l''assistant attend après un message écrit à la main, et peut le faire répondre tout de suite quand il a ouvert la conversation',
  'hidden'
)
on conflict (key) do nothing;
