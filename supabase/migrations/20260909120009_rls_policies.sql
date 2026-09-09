-- RLS sur toutes les tables V2 : chaque utilisateur ne voit que ses lignes,
-- le staff (viewer, admin, owner) lit tout, seuls admin et owner écrivent
-- au-delà de leurs propres données. Aucune table sans policy.

alter table public.profiles enable row level security;
alter table public.channel_accounts enable row level security;
alter table public.assistants enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.contacts enable row level security;
alter table public.deals enable row level security;
alter table public.bookings enable row level security;
alter table public.followups enable row level security;
alter table public.user_ai_keys enable row level security;
alter table public.ai_usage enable row level security;
alter table public.feature_flags enable row level security;
alter table public.user_feature_overrides enable row level security;
alter table public.feedback enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.system_events enable row level security;

create policy profiles_select on public.profiles
  for select to authenticated using (user_id = auth.uid() or public.is_staff());
create policy profiles_update on public.profiles
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin_or_owner())
  with check (user_id = auth.uid() or public.is_admin_or_owner());

create policy channel_accounts_select on public.channel_accounts
  for select to authenticated using (user_id = auth.uid() or public.is_staff());

create policy assistants_select on public.assistants
  for select to authenticated using (user_id = auth.uid() or public.is_staff());
create policy assistants_update on public.assistants
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin_or_owner())
  with check (user_id = auth.uid() or public.is_admin_or_owner());
create policy assistants_delete on public.assistants
  for delete to authenticated using (user_id = auth.uid());

create policy conversations_select on public.conversations
  for select to authenticated using (user_id = auth.uid() or public.is_staff());
create policy conversations_update on public.conversations
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy conversation_messages_select on public.conversation_messages
  for select to authenticated using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.user_id = auth.uid() or public.is_staff())
    )
  );

create policy contacts_all on public.contacts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy contacts_staff_select on public.contacts
  for select to authenticated using (public.is_staff());

create policy deals_all on public.deals
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy deals_staff_select on public.deals
  for select to authenticated using (public.is_staff());

create policy bookings_select on public.bookings
  for select to authenticated using (user_id = auth.uid() or public.is_staff());

create policy followups_all on public.followups
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy followups_staff_select on public.followups
  for select to authenticated using (public.is_staff());

create policy user_ai_keys_select on public.user_ai_keys
  for select to authenticated using (user_id = auth.uid() or public.is_staff());

create policy ai_usage_select on public.ai_usage
  for select to authenticated using (user_id = auth.uid() or public.is_staff());

create policy feature_flags_select on public.feature_flags
  for select to authenticated using (true);
create policy feature_flags_update on public.feature_flags
  for update to authenticated
  using (public.is_admin_or_owner())
  with check (public.is_admin_or_owner());

create policy user_feature_overrides_select on public.user_feature_overrides
  for select to authenticated using (user_id = auth.uid() or public.is_staff());
create policy user_feature_overrides_write on public.user_feature_overrides
  for all to authenticated
  using (public.is_admin_or_owner())
  with check (public.is_admin_or_owner());

create policy feedback_insert on public.feedback
  for insert to authenticated with check (user_id = auth.uid());
create policy feedback_select on public.feedback
  for select to authenticated using (user_id = auth.uid() or public.is_staff());

create policy admin_audit_log_select on public.admin_audit_log
  for select to authenticated using (public.is_staff());

create policy system_events_select on public.system_events
  for select to authenticated using (public.is_staff());

create policy paiement_subscriptions_staff_select on public.paiement_subscriptions
  for select to authenticated using (public.is_staff());
