-- Story 2.6 (FR2): per-pseudo lock of the password_verification_attempt hook.
begin;

select plan(28);

insert into auth.users (id, email, encrypted_password)
values (tests.uid('owner'), 'alice@table.invalid', 'hash-alice'),
       (tests.uid('other_player'), 'bob@table.invalid', 'hash-bob');
insert into public.profiles (user_id, pseudo, role, must_change_password)
values (tests.uid('owner'), 'alice', 'player', false),
       (tests.uid('other_player'), 'bob', 'player', false);

create function pg_temp.attempt(p_user uuid, p_valid boolean) returns text
language sql as $$
  select (internal.password_verification_hook(
           jsonb_build_object('user_id', p_user, 'valid', p_valid)
         ))->>'decision'
$$;
create function pg_temp.fail_five(p_user uuid) returns void
language sql as $$
  select pg_temp.attempt(p_user, false) from generate_series(1, 5)
$$;

-- Privileges -----------------------------------------------------------------------------------------------------------
select ok(
  has_function_privilege('supabase_auth_admin', 'internal.password_verification_hook(jsonb)', 'EXECUTE'),
  'the authentication server role can call the hook'
);
select ok(
  not has_function_privilege('authenticated', 'internal.password_verification_hook(jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'internal.password_verification_hook(jsonb)', 'EXECUTE')
  and not has_function_privilege('service_role', 'internal.password_verification_hook(jsonb)', 'EXECUTE')
  and not has_function_privilege('public', 'internal.password_verification_hook(jsonb)', 'EXECUTE'),
  'nobody else can call it'
);
select ok(
  not has_schema_privilege('authenticated', 'internal', 'USAGE')
  and not has_schema_privilege('anon', 'internal', 'USAGE')
  and not has_schema_privilege('service_role', 'internal', 'USAGE')
  and not has_table_privilege('authenticated', 'internal.login_attempts', 'SELECT')
  and not has_table_privilege('anon', 'internal.login_attempts', 'SELECT')
  and not has_table_privilege('authenticated', 'internal.login_locks', 'SELECT')
  and not has_table_privilege('anon', 'internal.login_locks', 'SELECT'),
  'the attempts and locks tables are out of reach of the API roles'
);
select throws_ok(
  $$select internal.password_verification_hook('{"valid": false}'::jsonb)$$,
  'P0001', 'password verification hook: user_id is missing', 'an event without user_id is refused loudly'
);

-- Counting and locking -------------------------------------------------------------------------------------------------
select is(pg_temp.attempt(tests.uid('owner'), false), 'continue', 'wrong password 1: left to the server (it refuses it)');
select is(pg_temp.attempt(tests.uid('owner'), false), 'continue', 'wrong password 2');
select is(pg_temp.attempt(tests.uid('owner'), false), 'continue', 'wrong password 3');
select is(pg_temp.attempt(tests.uid('owner'), false), 'continue', 'wrong password 4');
select is(pg_temp.attempt(tests.uid('owner'), false), 'continue', 'wrong password 5: still evaluated normally');
select is(pg_temp.attempt(tests.uid('owner'), false), 'reject', 'the 6th attempt is refused');
select is(pg_temp.attempt(tests.uid('owner'), true), 'reject', 'even with the right password while locked');
select is(
  (internal.password_verification_hook(jsonb_build_object('user_id', tests.uid('owner'), 'valid', true)))->>'message',
  'Invalid login credentials',
  'the refusal says exactly what a wrong password says (the lock is not revealed)'
);
select is(
  (select count(*)::int from internal.login_attempts where user_id = tests.uid('owner')), 5,
  'attempts made while locked are not recorded (insisting does not extend the lock)'
);
select ok(
  (select locked_until from internal.login_locks where user_id = tests.uid('owner')) > now() + interval '14 minutes',
  'the lock runs about 15 minutes from the 5th failure'
);

-- The lock lasts the whole 15 minutes, even when the 5 failures were spread over the window --------------------------
update internal.login_attempts set attempted_at = now() - interval '14 minutes' where user_id = tests.uid('owner');
select is(pg_temp.attempt(tests.uid('owner'), true), 'reject', 'failures spread over 14 minutes: the lock still holds');

-- Per pseudo only ------------------------------------------------------------------------------------------------------
select is(pg_temp.attempt(tests.uid('other_player'), true), 'continue', 'another pseudo is not locked');
select is(pg_temp.attempt(tests.uid('other_player'), false), 'continue', 'and keeps its own counter');
select is(
  (select count(*)::int from internal.login_attempts where user_id = tests.uid('other_player')), 1,
  'one failure recorded for the other pseudo'
);

-- Expiry: the counter starts again from zero ---------------------------------------------------------------------------
update internal.login_locks set locked_until = now() - interval '1 minute' where user_id = tests.uid('owner');
select is(pg_temp.attempt(tests.uid('owner'), true), 'continue', 'after the delay the right password works again');
select is(
  (select count(*)::int from internal.login_attempts where user_id = tests.uid('owner'))
  + (select count(*)::int from internal.login_locks where user_id = tests.uid('owner')),
  0,
  'and nothing of the old lock remains'
);

select pg_temp.fail_five(tests.uid('owner'));
update internal.login_locks set locked_until = now() - interval '1 second' where user_id = tests.uid('owner');
select is(pg_temp.attempt(tests.uid('owner'), false), 'continue', 'a wrong password right after the lock ends is just the 1st again');
select is(
  (select count(*)::int from internal.login_attempts where user_id = tests.uid('owner')), 1,
  '...and the counter shows 1 (no leftover from before the lock)'
);

-- A right password resets the count while not locked -------------------------------------------------------------------
delete from internal.login_attempts where user_id = tests.uid('owner');
select pg_temp.attempt(tests.uid('owner'), false) from generate_series(1, 4);
select pg_temp.attempt(tests.uid('owner'), true);
select is(pg_temp.attempt(tests.uid('owner'), false), 'continue', '4 failures, a success, then a failure: not locked');

-- Failures older than the window do not count --------------------------------------------------------------------------
delete from internal.login_attempts where user_id = tests.uid('owner');
insert into internal.login_attempts (user_id, attempted_at)
select tests.uid('owner'), now() - interval '20 minutes' from generate_series(1, 5);
select is(pg_temp.attempt(tests.uid('owner'), false), 'continue', '5 failures older than 15 minutes do not lock');
select is(
  (select count(*)::int from internal.login_attempts where user_id = tests.uid('owner')), 1,
  'the stale ones are dropped when the next failure is recorded'
);

-- A password change lifts the lock -------------------------------------------------------------------------------------
delete from internal.login_attempts where user_id = tests.uid('owner');
select pg_temp.fail_five(tests.uid('owner'));
select is(pg_temp.attempt(tests.uid('owner'), true), 'reject', 'locked again');
update auth.users set encrypted_password = 'hash-new' where id = tests.uid('owner');
select is(pg_temp.attempt(tests.uid('owner'), true), 'continue', 'a password change (DM reset, own change) lifts the lock');

-- Reactivation lifts it as well ----------------------------------------------------------------------------------------
select pg_temp.fail_five(tests.uid('owner'));
select public.archive_player(tests.uid('owner'));
select public.reactivate_player(tests.uid('owner'));
select is(pg_temp.attempt(tests.uid('owner'), true), 'continue', 'reactivating the account lifts the lock');

select * from finish();
rollback;
