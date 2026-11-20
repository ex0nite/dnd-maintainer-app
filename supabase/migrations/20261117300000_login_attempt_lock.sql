-- Story 2.6 (FR2, AD-9, AD-11): lock a pseudo for 15 minutes after 5 wrong passwords in 15 minutes, per pseudo only.
--
-- Hook `password_verification_attempt` of the authentication server (measured in docs/auth-spike.md): called with the
-- user id and whether the password was right; a `reject` decision refuses even a correct password. The hook is not
-- called for an unknown pseudo, so nothing is counted (and nothing can be enumerated through the lock) for those.
--
-- Rules:
--   * The 5th wrong password within 15 minutes locks the pseudo for exactly 15 minutes from that moment: every
--     attempt in that period is refused, right password included, and none is recorded (insisting does not extend it).
--   * At the end of the lock the counter starts again from zero.
--   * A right password while not locked clears the counter.
--   * The refusal carries the SAME message as a wrong password: the lock cannot be told apart from it.
--   * Another pseudo is never affected (the 5 players are not locked together).
--   * A password change (DM reset, own change) or a reactivation of the account lifts the lock at once.
--   * The lock is per pseudo, not per address: someone who knows a pseudo can keep it locked by trying every 15
--     minutes. Per-address limits (the proxy, story 7.3) slow that down. To lift a lock by hand, as the database
--     owner:  delete from internal.login_locks;  delete from internal.login_attempts;
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

create table internal.login_locks (
  user_id      uuid primary key,
  locked_until timestamptz not null
);

revoke all on internal.login_attempts, internal.login_locks from public, anon, authenticated;

create or replace function internal.password_verification_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   uuid;
  v_valid  boolean;
  v_fails  int;
  v_until  timestamptz;
begin
  v_user := (event ->> 'user_id')::uuid;
  if v_user is null then
    raise exception 'password verification hook: user_id is missing';
  end if;
  v_valid := coalesce((event ->> 'valid')::boolean, false);

  -- One attempt at a time per pseudo, so parallel guesses cannot slip past the count.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  select locked_until into v_until from internal.login_locks where user_id = v_user;
  if v_until is not null then
    if v_until > now() then
      -- Same text and shape as a wrong password; nothing is recorded while locked.
      return jsonb_build_object('decision', 'reject', 'message', 'Invalid login credentials');
    end if;
    -- The lock is over: start again from zero.
    delete from internal.login_locks where user_id = v_user;
    delete from internal.login_attempts where user_id = v_user;
  end if;

  if v_valid then
    delete from internal.login_attempts where user_id = v_user;
    return jsonb_build_object('decision', 'continue');
  end if;

  -- Failures older than the window are of no use (only this user's rows: no global scan, no cross-user waiting).
  delete from internal.login_attempts where user_id = v_user and attempted_at < now() - interval '15 minutes';
  insert into internal.login_attempts (user_id) values (v_user);
  select count(*) into v_fails from internal.login_attempts where user_id = v_user;
  if v_fails >= 5 then
    insert into internal.login_locks (user_id, locked_until) values (v_user, now() + interval '15 minutes')
      on conflict (user_id) do update set locked_until = excluded.locked_until;
  end if;
  -- This 5th failure itself is a wrong password: the server refuses it as usual.
  return jsonb_build_object('decision', 'continue');
end;
$$;

revoke all on function internal.password_verification_hook(jsonb) from public, anon, authenticated;
grant execute on function internal.password_verification_hook(jsonb) to supabase_auth_admin;

-- A password change lifts the lock (DM reset, the player's own change): the old guesses mean nothing any more.
create or replace function internal.clear_login_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from internal.login_locks where user_id = new.id;
  delete from internal.login_attempts where user_id = new.id;
  return null;
end;
$$;

revoke all on function internal.clear_login_lock() from public, anon, authenticated;

create trigger clear_login_lock
  after update of encrypted_password on auth.users
  for each row
  when (old.encrypted_password is distinct from new.encrypted_password)
  execute function internal.clear_login_lock();

-- Reactivating an account also starts it from a clean slate (same body as story 2.5, plus the lock).
create or replace function public.reactivate_player(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  select role into v_role from public.profiles where user_id = p_user_id for update;
  if v_role is null then
    raise exception 'unknown account' using errcode = 'P0002';
  end if;
  if v_role <> 'player' then
    raise exception 'only a player account can be reactivated' using errcode = '42501';
  end if;

  update public.profiles set archived_at = null where user_id = p_user_id;

  update public.characters
     set is_active = true,
         archived_with_owner = false
   where owner_user_id = p_user_id
     and archived_with_owner;

  delete from internal.login_locks where user_id = p_user_id;
  delete from internal.login_attempts where user_id = p_user_id;
end;
$$;
