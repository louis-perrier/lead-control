-- Fonctions de déclencheur : jamais appelables par l'API, elles ne servent qu'aux triggers.
revoke all on function public.notify_conversation_error() from public, anon, authenticated;
revoke all on function public.push_new_notification() from public, anon, authenticated;
