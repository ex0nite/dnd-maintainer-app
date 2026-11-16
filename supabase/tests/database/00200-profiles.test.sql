-- Story 1.2 (AD-3, AD-15): `profiles` structure and write lock.
-- Identity coverage of the other tables comes with their own stories.
begin;

select plan(20);

-- Fixtures (privileged test owner): one DM and one player, authentication rows first.
insert into auth.users (id, email)
values (tests.uid('dm'), 'maitre@table.invalid'),
       (tests.uid('owner'), 'alice@table.invalid'),
       (tests.uid('other_player'), 'bob@table.invalid');

insert into public.profiles (user_id, pseudo, role)
values (tests.uid('dm'), 'maitre', 'dm'),
       (tests.uid('owner'), 'alice', 'player');

select has_table('public', 'profiles', 'profiles exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'RLS is enabled on profiles'
);
select is(
  (select must_change_password from public.profiles where pseudo = 'alice'),
  true,
  'a new profile must change its password by default'
);

-- Constraints, as the privileged owner.
select throws_ok(
  $$insert into public.profiles (user_id, pseudo, role) values (tests.uid('other_player'), 'rival', 'dm')$$,
  '23505', null, 'a second dm is refused by the unique index'
);
select throws_ok(
  $$insert into public.profiles (user_id, pseudo, role) values (tests.uid('other_player'), 'alice', 'player')$$,
  '23505', null, 'a duplicate pseudo is refused'
);
select throws_ok(
  $$insert into public.profiles (user_id, pseudo, role) values (tests.uid('other_player'), 'Bob', 'player')$$,
  '23514', null, 'an upper-case pseudo is refused'
);
select throws_ok(
  $$insert into public.profiles (user_id, pseudo, role) values (tests.uid('other_player'), 'bo', 'player')$$,
  '23514', null, 'a too-short pseudo is refused'
);
select throws_ok(
  $$insert into public.profiles (user_id, pseudo, role) values (tests.uid('other_player'), 'bob', 'admin')$$,
  '23514', null, 'an unknown role is refused'
);
select lives_ok(
  $$insert into public.profiles (user_id, pseudo, role) values (tests.uid('other_player'), 'bob', 'player')$$,
  'a second player is accepted (positive control)'
);

-- Privileges: no write for any API role, nothing for anon.
select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'INSERT')
  and not has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.profiles', 'DELETE'),
  'authenticated has no write privilege on profiles'
);
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'profiles'
      and grantee in ('anon', 'authenticated', 'PUBLIC')
      and not (grantee = 'authenticated' and privilege_type = 'SELECT')),
  0,
  'anon, PUBLIC and authenticated hold no privilege on profiles except authenticated SELECT'
);
select throws_ok(
  $$update public.profiles set role = 'dm' where pseudo = 'bob'$$,
  '23505', null, 'promoting a player to a second dm is refused by the unique index'
);

-- Behaviour as a connected player.
select tests.set_identity('owner');
select is(
  (select array_agg(pseudo order by pseudo) from public.profiles),
  array['alice'],
  'a player reads only their own profile (not the DM, not another player)'
);
select throws_ok(
  $$insert into public.profiles (user_id, pseudo, role) values (gen_random_uuid(), 'sneaky', 'player')$$,
  '42501', null, 'a player cannot insert a profile'
);
select throws_ok(
  $$update public.profiles set role = 'dm' where user_id = tests.uid('owner')$$,
  '42501', null, 'a player cannot promote themselves'
);
select throws_ok(
  $$delete from public.profiles where user_id = tests.uid('owner')$$,
  '42501', null, 'a player cannot delete a profile'
);

-- AD-3: an archived user and a user on a temporary password still read their own profile
-- (the front needs it). They only see that one row.
select tests.reset_identity();
insert into auth.users (id, email)
values (tests.uid('archived'), 'carol@table.invalid'), (tests.uid('temp_password'), 'dave@table.invalid');
insert into public.profiles (user_id, pseudo, role, archived_at)
values (tests.uid('archived'), 'carol', 'player', now());
insert into public.profiles (user_id, pseudo, role)
values (tests.uid('temp_password'), 'dave', 'player');
select tests.set_identity('archived');
select is((select array_agg(pseudo) from public.profiles), array['carol'], 'an archived user reads only their own profile');
select tests.set_identity('temp_password');
select is((select array_agg(pseudo) from public.profiles), array['dave'], 'a temporary-password user reads only their own profile');
select tests.set_identity('non_member');
select is((select count(*)::int from public.profiles), 0, 'a user without profile reads nothing');

-- Behaviour as anonymous.
select tests.set_identity('anon');
select throws_ok($$select * from public.profiles$$, '42501', null, 'anon cannot read profiles');

select tests.reset_identity();
select * from finish();
rollback;
