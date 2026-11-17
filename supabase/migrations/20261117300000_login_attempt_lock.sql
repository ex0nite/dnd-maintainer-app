-- Story 2.6 (FR2, AD-9, AD-11): lock a pseudo after 5 wrong passwords in 15 minutes, per pseudo only.
--
-- Hook `password_verification_attempt` of the authentication server (measured in docs/auth-spike.md): called with the
-- user id and whether the password was right; a `reject` decision refuses even a correct password. The hook is not
-- called for an unknown pseudo, so nothing is counted (and nothing can be enumerated) for those.
--
-- Rules:
--   * 5 failures in the last 15 minutes lock the pseudo: the 6th attempt and the following ones are refused, right
--     password included, until the oldest of those failures is 15 minutes old. Attempts made while locked are NOT
--     recorded, so an attacker cannot extend the lock by insisting.
--   * A right password while not locked clears the counter.
--   * The refusal carries the SAME message as a wrong password: the lock cannot be told apart from it.
--   * Another pseudo is never affected (the 5 players are not locked together).
--   * The lock is per pseudo, not per address: someone who knows a pseudo can keep it locked by trying every 15
--     minutes. Per-address limits (the proxy, story 7.3) are what slows that down. If the DM is locked out for a good
--     reason or not, the owner clears it from the database:  delete from internal.login_attempts;
--
-- Deployment order (QNAP, story 7.2): this migration first, THEN the hook settings of the authentication server
-- (GOTRUE_HOOK_PASSWORD_VERIFICATION_ATTEMPT_ENABLED / _URI). A hook configured before its function exists makes every
-- sign-in fail with a 500 (fail closed, measured by the spike).
--
-- Lives in its own schema, which PostgREST does not expose: nothing here is reachable through the API.

create schema if not exists internal;
revoke all on schema internal from public, anon, authenticated;
grant usage on schema internal to supabase_auth_admin;

create table internal.login_attempts (
  id           bigint generated always as identity primary key,
  user_id      uuid not null,
  attempted_at timestamptz not null default now()
);

create index login_attempts_user_time_idx on internal.login_attempts (user_id, attempted_at);

revoke all on internal.login_attempts from public, anon, authenticated;

create or replace function internal.password_verification_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid;
  v_valid boolean;
  v_fails int;
begin
  v_user := (event ->> 'user_id')::uuid;
  v_valid := coalesce((event ->> 'valid')::boolean, false);

  -- One attempt at a time per pseudo, so parallel guesses cannot slip past the count.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  -- Housekeeping: failures older than a day are of no use.
  delete from internal.login_attempts where attempted_at < now() - interval '1 day';

  select count(*) into v_fails
    from internal.login_attempts
   where user_id = v_user
     and attempted_at > now() - interval '15 minutes';

  if v_fails >= 5 then
    -- Same text and shape as a wrong password; nothing is recorded while locked.
    return jsonb_build_object('decision', 'reject', 'message', 'Invalid login credentials');
  end if;

  if v_valid then
    delete from internal.login_attempts where user_id = v_user;
  else
    insert into internal.login_attempts (user_id) values (v_user);
  end if;
  return jsonb_build_object('decision', 'continue');
end;
$$;

revoke all on function internal.password_verification_hook(jsonb) from public, anon, authenticated;
grant execute on function internal.password_verification_hook(jsonb) to supabase_auth_admin;
