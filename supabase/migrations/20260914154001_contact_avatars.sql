-- Photo de profil Instagram des prospects. Meta ne fournit qu'un lien qui expire au bout de
-- quelques jours : une copie privée est gardée, rafraîchie chaque semaine et supprimée à la
-- déconnexion du compte Instagram.
alter table public.conversations
  add column if not exists contact_avatar_path text,
  add column if not exists contact_avatar_checked_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contact-avatars', 'contact-avatars', false, 307200, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists contact_avatars_storage_select on storage.objects;
create policy contact_avatars_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'contact-avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff()));
