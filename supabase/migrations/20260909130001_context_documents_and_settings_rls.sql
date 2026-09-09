-- Faille V1 trouvée en cours d'audit : platform_settings n'avait ni RLS ni policies,
-- avec des droits complets accordés à anon. Corrigé ici, avant d'y stocker un réglage
-- admin (prix par message pour le calculateur de coût).
alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon, authenticated;
grant select, insert, update on public.platform_settings to authenticated;

create policy platform_settings_select on public.platform_settings
  for select to authenticated using (public.is_staff());
create policy platform_settings_write on public.platform_settings
  for all to authenticated using (public.is_admin_or_owner()) with check (public.is_admin_or_owner());

-- Documents de contexte (RAG) : le coach peut, plutôt que de tout taper dans le champ
-- Contexte, importer un ou plusieurs documents texte. Quota par offre plutôt que
-- recherche par similarité : à cette échelle (1 à 10 documents courts), tout injecter
-- dans le prompt est plus simple et plus fiable qu'une recherche vectorielle.
create table public.context_documents (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  title text not null,
  storage_path text not null,
  mime_type text,
  status text not null default 'processing' check (status in ('processing', 'ready', 'error')),
  extracted_text text,
  char_count integer,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index context_documents_user_idx on public.context_documents (user_id);

alter table public.context_documents enable row level security;
create policy context_documents_select on public.context_documents
  for select to authenticated using (user_id = auth.uid() or public.is_staff());
create policy context_documents_insert on public.context_documents
  for insert to authenticated with check (user_id = auth.uid());
create policy context_documents_delete on public.context_documents
  for delete to authenticated using (user_id = auth.uid() or public.is_admin_or_owner());
-- Le statut et le texte extrait sont écrits par la fonction Edge (service role) après lecture du fichier.
revoke update on public.context_documents from authenticated;

create or replace function public.max_context_documents(p_user_id uuid)
returns integer language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when exists (
      select 1 from public.profiles where user_id = p_user_id and plan_override in ('free_unlimited', 'beta_byok')
    ) then 10
    when exists (
      select 1 from public.paiement_subscriptions where user_id = p_user_id and status in ('active', 'trialing')
    ) then 1
    else 0
  end;
$$;
revoke all on function public.max_context_documents(uuid) from public, anon;
grant execute on function public.max_context_documents(uuid) to authenticated, service_role;

insert into storage.buckets (id, name, public)
values ('context-documents', 'context-documents', false)
on conflict (id) do nothing;

create policy context_documents_storage_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'context-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy context_documents_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'context-documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff()));
create policy context_documents_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'context-documents' and (storage.foldername(name))[1] = auth.uid()::text);

update public.feature_flags set stage = 'all', updated_at = now() where key in ('context_documents', 'custom_tone');
