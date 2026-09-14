-- Longueur du fichier avant la coupe d'import à 40 000 caractères : sans elle, un document
-- tronqué à l'import s'affichait lu en entier.
alter table public.context_documents
  add column if not exists source_char_count integer;

update public.context_documents
   set source_char_count = char_count
 where source_char_count is null and char_count is not null;
