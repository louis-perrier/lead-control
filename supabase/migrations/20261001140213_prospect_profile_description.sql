update public.feature_flags
set description = 'L''assistant connaît le nombre d''abonnés arrondi du prospect, fait confirmer son nom Instagram à la réservation et l''amène à parler de son contenu',
    updated_at = now()
where key = 'prospect_profile';
