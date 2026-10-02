-- Ce que le client dit de lui, lu par tous ses assistants.
alter table public.profiles
  add column if not exists about jsonb not null default '{}'::jsonb;

insert into public.feature_flags (key, label, description, stage)
values (
  'seller_profile',
  'À propos de vous',
  'Le client décrit qui il est (nom, activité, parcours, chiffres) et l''assistant s''en sert quand un prospect l''interroge sur lui',
  'hidden'
)
on conflict (key) do nothing;
