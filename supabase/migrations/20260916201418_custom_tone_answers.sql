alter table public.assistants
  add column custom_tone_answers jsonb not null default '{}'::jsonb
  constraint assistants_custom_tone_answers_size check (octet_length(custom_tone_answers::text) <= 100000);
