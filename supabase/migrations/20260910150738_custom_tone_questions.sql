alter table public.assistants
  add column custom_tone_questions jsonb not null default '[]'::jsonb;
