insert into public.feature_flags (key, label, description, stage)
values (
  'quoted_replies',
  'Réponse à un message précis',
  'Quand le prospect aborde plusieurs sujets d''affilée, l''assistant peut rattacher une bulle au message auquel elle répond',
  'hidden'
)
on conflict (key) do nothing;
