-- Story 2.3 (AD-3, AD-11): the temporary password serves once; the sign-in address is immutable.
begin;

select plan(19);

insert into auth.users (id, email, encrypted_password)
values (tests.uid('temp_password'), 'dave@table.invalid', 'hash-temporary'),
       (tests.uid('owner'), 'alice@table.invalid', 'hash-alice'),
       (tests.uid('dm'), 'maitre@table.invalid', 'hash-dm'),
       (tests.uid('non_member'), 'erin@table.invalid', 'hash-erin');

-- erin has no profile on purpose: the trigger must not fail for a user without one.
insert into public.profiles (user_id, pseudo, role, must_change_password)
values (tests.uid('dm'), 'maitre', 'dm', false),
       (tests.uid('owner'), 'alice', 'player', true),
       (tests.uid('temp_password'), 'dave', 'player', true);

insert into public.campaigns (id, name, description)
values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Campaign A', 'a');
insert into public.campaign_members (campaign_id, user_id)
values ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('temp_password'));

-- ---------------------------------------------------------------------------
-- While on the temporary password: own profile readable, no data, flag not writable.
-- ---------------------------------------------------------------------------
select tests.set_identity('temp_password');
select is(
  (select must_change_password from public.profiles where user_id = tests.uid('temp_password')),
  true,
  'a player on a temporary password reads their own profile (flag true)'
);
select is(
  (select count(*)::int from public.campaigns), 0,
  'a player on a temporary password sees no campaign data'
);
select throws_ok(
  $$update public.profiles set must_change_password = false where user_id = tests.uid('temp_password')$$,
  '42501', null, 'the player cannot clear must_change_password themselves'
);
select throws_ok(
  $$insert into public.profiles (user_id, pseudo, role) values (tests.uid('temp_password'), 'again', 'player')$$,
  '42501', null, 'the player cannot write profiles at all'
);

-- ---------------------------------------------------------------------------
-- The flag drops when the password really changes.
-- ---------------------------------------------------------------------------
select tests.reset_identity();

update auth.users set last_sign_in_at = now() where id = tests.uid('temp_password');
select is(
  (select must_change_password from public.profiles where user_id = tests.uid('temp_password')),
  true,
  'a sign-in (no password change) keeps the flag'
);

update auth.users set encrypted_password = encrypted_password where id = tests.uid('temp_password');
select is(
  (select must_change_password from public.profiles where user_id = tests.uid('temp_password')),
  true,
  'rewriting the same hash keeps the flag'
);

update auth.users set encrypted_password = 'hash-chosen-by-dave' where id = tests.uid('temp_password');
select is(
  (select must_change_password from public.profiles where user_id = tests.uid('temp_password')),
  false,
  'a new password hash clears the flag'
);
select is(
  (select must_change_password from public.profiles where user_id = tests.uid('owner')),
  true,
  'another player''s flag is untouched'
);

select lives_ok(
  $$update auth.users set encrypted_password = 'hash-erin-2' where id = tests.uid('non_member')$$,
  'a password change for a user without profile does not fail'
);

-- the DM reset sequence of story 2.4: flag and marker raised FIRST, then the password changes
update public.profiles set must_change_password = true, password_reset_pending = true
 where user_id = tests.uid('temp_password');
select is(
  (select must_change_password from public.profiles where user_id = tests.uid('temp_password')),
  true,
  'a reset raises the flag before the password changes (no window with the flag down)'
);
-- (the real GoTrue role, supabase_auth_admin, cannot be assumed from pgTAP: services/account-admin/spike/integration-2-3.mjs proves it end to end)
update auth.users set encrypted_password = 'hash-temporary-2' where id = tests.uid('temp_password');
select is(
  (select must_change_password::text || '/' || password_reset_pending::text
     from public.profiles where user_id = tests.uid('temp_password')),
  'true/false',
  'the reset password change keeps the flag up and consumes the marker'
);

-- data access follows the flag (the restrictive policy reads it)
select tests.set_identity('temp_password');
select is(
  (select count(*)::int from public.campaigns), 0,
  'after the reset the player sees nothing again'
);
select tests.reset_identity();
update auth.users set encrypted_password = 'hash-chosen-again' where id = tests.uid('temp_password');
select is(
  (select must_change_password::text || '/' || password_reset_pending::text
     from public.profiles where user_id = tests.uid('temp_password')),
  'false/false',
  'the player''s own password change lowers the flag'
);
select tests.set_identity('temp_password');
select is(
  (select count(*)::int from public.campaigns), 1,
  'after choosing a password the player sees their campaign'
);
select tests.reset_identity();

-- ---------------------------------------------------------------------------
-- The sign-in address is immutable.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$update auth.users set email = 'new@table.invalid' where id = tests.uid('owner')$$,
  '42501', null, 'the address cannot be changed'
);
select throws_ok(
  $$update auth.users set email_change = 'evil@table.invalid' where id = tests.uid('owner')$$,
  '42501', null, 'a pending address change cannot be recorded'
);
select lives_ok(
  $$update auth.users set email_change = '' where id = tests.uid('owner')$$,
  'resetting email_change from NULL to empty is not a change'
);
select is(
  (select email from auth.users where id = tests.uid('owner')),
  'alice@table.invalid',
  'the address is unchanged'
);

-- ---------------------------------------------------------------------------
-- The trigger functions are not callable through the API.
-- ---------------------------------------------------------------------------
select ok(
  not has_function_privilege('authenticated', 'public.clear_must_change_password()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.clear_must_change_password()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.refuse_address_change()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.refuse_address_change()', 'EXECUTE'),
  'the trigger functions are not executable by API roles'
);

select * from finish();
rollback;
