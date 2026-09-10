alter table public.profiles
  add column if not exists city text,
  add column if not exists company_name text,
  add column if not exists company_size text
    check (company_size in ('1', '2-10', '11-50', '51-200', '200+'));
