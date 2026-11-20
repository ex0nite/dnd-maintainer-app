-- Story 2.4 (AD-2): account-admin must be able to end every session of a user (password reset, archiving).
--
-- GoTrue offers no admin call that revokes the sessions of a user by id (spike 2.1: deleting the `auth.sessions`
-- rows is what makes the refresh token fail at once). PostgREST cannot reach the `auth` schema, so the service calls
-- this function; it is executable by `service_role` only, never by a signed-in user or by anon.
--
-- An access token already issued stays valid until it expires (up to 3600 s) on PostgREST: the immediate cut-off
-- of data access comes from the database (`profiles.archived_at`, `must_change_password` -> is_active_user()).

create or replace function public.revoke_user_sessions(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.sessions where user_id = p_user_id;
$$;

revoke all on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;
