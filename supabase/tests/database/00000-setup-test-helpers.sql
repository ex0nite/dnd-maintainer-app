-- Test-only helpers for the pgTAP suite (AD-14).
--
-- This file has no BEGIN/ROLLBACK on purpose: it is a setup file, run first
-- (alphabetical order) by `supabase test db`, and what it creates persists for
-- the test files that follow. It only ever touches the local/CI test database,
-- never a migration, so nothing here reaches production.
--
-- The seven identities every table must be tested against (AD-14):
--   anon, owner, other_player, archived, temp_password, non_member, dm
-- `tests.uid(identity)` gives each one a fixed UUID. Later stories insert the
-- matching `profiles` / `campaign_members` rows for those UUIDs inside their own
-- test transaction, so the helpers carry no knowledge of the schema.

create extension if not exists pgtap with schema extensions;

create schema if not exists tests;
grant usage on schema tests to anon, authenticated;

create or replace function tests.uid(identity text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case identity
    when 'owner'         then '00000000-0000-4000-8000-000000000001'::uuid
    when 'other_player'  then '00000000-0000-4000-8000-000000000002'::uuid
    when 'archived'      then '00000000-0000-4000-8000-000000000003'::uuid
    when 'temp_password' then '00000000-0000-4000-8000-000000000004'::uuid
    when 'non_member'    then '00000000-0000-4000-8000-000000000005'::uuid
    when 'dm'            then '00000000-0000-4000-8000-000000000006'::uuid
    else null
  end
$$;

-- Switch the current transaction to one of the seven identities.
-- Must be called inside a test transaction: everything is `set local`.
create or replace function tests.set_identity(identity text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if identity = 'anon' then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claim.role', 'anon', true);
    execute 'set local role anon';
    return;
  end if;

  if tests.uid(identity) is null then
    raise exception 'unknown test identity: %', identity;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', tests.uid(identity), 'role', 'authenticated')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', tests.uid(identity)::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end
$$;

-- Back to the privileged test owner (to prepare or inspect data).
create or replace function tests.reset_identity()
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
end
$$;

-- Number of rows a statement affected. A write blocked by RLS does not raise:
-- it affects 0 rows, so tests must count rows (AD-5, AD-14).
-- Usage: select is(tests.rows_affected($q$update ... $q$), 0, '...');
create or replace function tests.rows_affected(statement text)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  n bigint;
begin
  execute statement;
  get diagnostics n = row_count;
  return n;
end
$$;

grant execute on all functions in schema tests to anon, authenticated;

-- pg_prove expects a TAP plan from every file.
select plan(1);
select ok(
  tests.uid('owner') is not null and to_regprocedure('tests.set_identity(text)') is not null,
  'test helpers installed'
);
select * from finish();
