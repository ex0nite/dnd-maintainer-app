-- Story 2.6 (FR2): per-pseudo lock of the password_verification_attempt hook.
begin;

select plan(19);

insert into auth.users (id, email)
values (tests.uid('owner'), 'alice@table.invalid'),
       (tests.uid('other_player'), 'bob@table.invalid');

create function pg_temp.attempt(p_user uuid, p_valid boolean) returns text
language sql as $$
  select (internal.password_verification_hook(
           jsonb_build_object('user_id', p_user, 'valid', p_valid)
         ))->>'decision'
$$;

-- Privileges -----------------------------------------------------------------------------------------------------------
select ok(
  has_function_privilege('supabase_auth_admin', 'internal.password_verification_hook(jsonb)', 'EXECUTE'),
  'the authentication server role can call the hook'
);
select ok(
  not has_function_privilege('authenticated', 'internal.password_verification_hook(jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'internal.password_verification_hook(jsonb)', 'EXECUTE')
  and not has_function_privilege('public', 'internal.password_verification_hook(jsonb)', 'EXECUTE'),
  'nobody else can call it'
);
select ok(
  not has_schema_privilege('authenticated', 'internal', 'USAGE')
  and not has_schema_privilege('anon', 'internal', 'USAGE')
  and not has_table_privilege('authenticated', 'internal.login_attempts', 'SELECT')
  and not has_table_privilege('anon', 'internal.login_attempts', 'SELECT'),
  'the attempts table is out of reach of the API roles'
);
-- Counting -------------------------------------------------------------------------------------------------------------
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

-- Per pseudo only ------------------------------------------------------------------------------------------------------
select is(pg_temp.attempt(tests.uid('other_player'), true), 'continue', 'another pseudo is not locked');
select is(pg_temp.attempt(tests.uid('other_player'), false), 'continue', 'and keeps its own counter');
select is(
  (select count(*)::int from internal.login_attempts where user_id = tests.uid('other_player')), 1,
  'one failure recorded for the other pseudo'
);

-- Expiry ---------------------------------------------------------------------------------------------------------------
update internal.login_attempts set attempted_at = now() - interval '16 minutes' where user_id = tests.uid('owner');
select is(pg_temp.attempt(tests.uid('owner'), true), 'continue', 'after the delay the right password works again');
select is(
  (select count(*)::int from internal.login_attempts where user_id = tests.uid('owner')), 0,
  'and a right password clears the counter'
);

-- A right password resets the count while not locked --------------------------------------------------------------------
select pg_temp.attempt(tests.uid('owner'), false);
select pg_temp.attempt(tests.uid('owner'), false);
select pg_temp.attempt(tests.uid('owner'), false);
select pg_temp.attempt(tests.uid('owner'), false);
select pg_temp.attempt(tests.uid('owner'), true);
select is(pg_temp.attempt(tests.uid('owner'), false), 'continue', '4 failures, a success, then a failure: not locked');

-- Failures older than the window do not count --------------------------------------------------------------------------
delete from internal.login_attempts where user_id = tests.uid('owner');
insert into internal.login_attempts (user_id, attempted_at)
select tests.uid('owner'), now() - interval '20 minutes' from generate_series(1, 5);
select is(pg_temp.attempt(tests.uid('owner'), false), 'continue', '5 failures older than 15 minutes do not lock');

select * from finish();
rollback;
