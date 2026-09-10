alter table secrets.oauth_states drop constraint if exists ouath_states_user_id_key;
alter table secrets.oauth_states drop constraint if exists ouath_states_user_id_fkey;
alter table secrets.oauth_states
  add constraint oauth_states_user_id_fkey
  foreign key (user_id) references public.profiles (user_id) on delete cascade;
alter table secrets.oauth_states drop column if exists configs_id;
