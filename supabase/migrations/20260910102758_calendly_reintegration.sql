create index if not exists bookings_conversation_idx on public.bookings (conversation_id);

update public.feature_flags set stage = 'staff', updated_at = now() where key = 'calendly';
