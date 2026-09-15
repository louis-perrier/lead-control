-- Réaction posée par le compte sur un message du prospect (❤️ quand l'agent clôt un échange
-- par un like au lieu de reprendre la parole). Affichée sur la bulle dans la boîte de réception.
alter table public.conversation_messages
  add column if not exists reaction text;
