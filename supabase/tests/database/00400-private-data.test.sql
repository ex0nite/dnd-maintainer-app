-- Story 1.5 (AD-5, AD-14): character_private, session_dm, owns_character, for the seven identities.
begin;

select plan(99);

-- ---------------------------------------------------------------------------
-- Fixtures (privileged test owner)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email)
select tests.uid(i), i || '@table.invalid'
from unnest(array['owner', 'other_player', 'archived', 'temp_password', 'non_member', 'dm']) as i;

insert into public.profiles (user_id, pseudo, role, must_change_password, archived_at)
values (tests.uid('dm'), 'maitre', 'dm', false, null),
       (tests.uid('owner'), 'alice', 'player', false, null),
       (tests.uid('other_player'), 'bob', 'player', false, null),
       (tests.uid('archived'), 'carol', 'player', false, now()),
       (tests.uid('temp_password'), 'dave', 'player', true, null),
       (tests.uid('non_member'), 'erin', 'player', false, null);

insert into public.campaigns (id, name)
values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Campaign A');

insert into public.campaign_members (campaign_id, user_id)
values ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('owner')),
       ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('other_player')),
       ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('archived')),
       ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('temp_password'));

-- One character per player-ish identity, so each can be tested as "their own".
insert into public.characters (id, campaign_id, name, character_type, owner_user_id)
values ('c1000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Alice PC', 'pc', tests.uid('owner')),
       ('c2000000-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Bob PC', 'pc', tests.uid('other_player')),
       ('c3000000-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Carol PC', 'pc', tests.uid('archived')),
       ('c4000000-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Dave PC', 'pc', tests.uid('temp_password')),
       ('c5000000-0000-4000-8000-000000000005', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Orphan NPC', 'npc', null),
       ('c7000000-0000-4000-8000-000000000007', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Erin PC', 'pc', tests.uid('non_member'));

insert into public.sessions (id, campaign_id, session_number)
values ('51000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', 1);

update public.character_private set backstory = 'ALICE SECRET', notes = 'alice notes'
 where character_id = 'c1000000-0000-4000-8000-000000000001';
update public.character_private set backstory = 'ERIN SECRET' where character_id = 'c7000000-0000-4000-8000-000000000007';
update public.character_private set backstory = 'BOB SECRET'
 where character_id = 'c2000000-0000-4000-8000-000000000002';
update public.session_dm set notes = 'DM SESSION SECRET', experience_awarded = 300, loot = '[{"item":"gem"}]'::jsonb
 where session_id = '51000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.character_private), 6, 'every character got its private row (trigger)');
select is((select count(*)::int from public.session_dm), 1, 'every session got its DM row (trigger)');
select hasnt_column('public', 'characters', 'backstory', 'characters no longer carries backstory');
select hasnt_column('public', 'characters', 'notes', 'characters no longer carries notes');
select hasnt_column('public', 'sessions', 'notes', 'sessions no longer carries notes');
select hasnt_column('public', 'sessions', 'loot', 'sessions no longer carries loot');
select hasnt_column('public', 'sessions', 'experience_awarded', 'sessions no longer carries experience_awarded');
select has_column('public', 'characters', 'owner_user_id', 'characters.owner_user_id exists');
select col_is_null('public', 'characters', 'owner_user_id', 'owner_user_id is nullable (existing characters have no account)');
select col_default_is('public', 'characters', 'archived_with_owner', 'false', 'archived_with_owner defaults to false');
select is(
  (select confdeltype::text from pg_constraint where conrelid = 'public.characters'::regclass
    and contype = 'f' and conkey = array[(select attnum from pg_attribute where attrelid = 'public.characters'::regclass and attname = 'owner_user_id')]),
  'n', 'owner_user_id is ON DELETE SET NULL'
);
select ok(
  (select p.prosecdef and p.provolatile = 's' and p.proconfig = array['search_path=""']
     from pg_proc p where p.oid = 'public.owns_character(uuid)'::regprocedure),
  'owns_character is SECURITY DEFINER STABLE with an empty search_path'
);
select ok(
  not has_function_privilege('anon', 'public.owns_character(uuid)', 'EXECUTE')
  and not has_function_privilege('public', 'public.owns_character(uuid)', 'EXECUTE'),
  'anon and PUBLIC cannot execute owns_character'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename in ('character_private', 'session_dm')
      and policyname = 'access_active' and permissive = 'RESTRICTIVE' and roles = '{authenticated}'
      and cmd = 'ALL' and qual = '(is_dm() OR is_active_user())'),
  2, 'the restrictive active-user policy is on both tables'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename in ('character_private', 'session_dm')
      and (qual = 'true' or with_check = 'true')),
  0, 'no open policy on the private tables'
);
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name in ('character_private', 'session_dm')
      and grantee in ('anon', 'PUBLIC')),
  0, 'anon and PUBLIC hold no privilege on the private tables'
);
select ok(
  not has_table_privilege('authenticated', 'public.character_private', 'TRUNCATE')
  and not has_table_privilege('authenticated', 'public.session_dm', 'TRUNCATE')
  and not has_any_column_privilege('anon', 'public.character_private', 'SELECT')
  and not has_any_column_privilege('anon', 'public.session_dm', 'SELECT'),
  'no TRUNCATE for authenticated, no column privilege for anon'
);

-- owns_character per identity
select tests.set_identity('owner');
select ok(public.owns_character('c1000000-0000-4000-8000-000000000001')
          and not public.owns_character('c2000000-0000-4000-8000-000000000002')
          and not public.owns_character('c5000000-0000-4000-8000-000000000005'),
          'owner owns exactly their character (an ownerless character is nobody''s)');
select tests.set_identity('anon');
select throws_ok($$select public.owns_character('c1000000-0000-4000-8000-000000000001')$$, '42501', null, 'anon cannot call owns_character');

-- ---------------------------------------------------------------------------
-- character_private: reads
-- ---------------------------------------------------------------------------
select tests.set_identity('anon');
select throws_ok($$select * from public.character_private$$, '42501', null, 'anon: character_private refused');

select tests.set_identity('owner');
select is((select array_agg(backstory) from public.character_private), array['ALICE SECRET'], 'owner reads only their own private part');
select tests.set_identity('other_player');
select is((select array_agg(backstory) from public.character_private), array['BOB SECRET'], 'other_player reads only theirs, not Alice''s');
select tests.set_identity('archived');
select is((select count(*)::int from public.character_private), 0, 'archived owner reads nothing');
select tests.set_identity('temp_password');
select is((select count(*)::int from public.character_private), 0, 'temporary-password owner reads nothing');
select tests.set_identity('non_member');
select is((select count(*)::int from public.character_private), 0, 'a non-member who owns a character still reads nothing (AD-4: owner AND member)');
select tests.set_identity('dm');
select is((select count(*)::int from public.character_private), 6, 'dm reads every private part');

-- character_private: writes (owner writes arrive with epic 3: today the DM only)
select tests.set_identity('owner');
select is(tests.rows_affected($$update public.character_private set backstory = 'pwn'$$)::int, 1, 'owner: writes their own private part (story 3.6)');
select is(tests.rows_affected($$delete from public.character_private$$)::int, 0, 'owner: private part not deletable');
select throws_ok($$insert into public.character_private (character_id) values ('c5000000-0000-4000-8000-000000000005')$$, '42501', null, 'owner: cannot insert');
select tests.set_identity('other_player');
select is(tests.rows_affected($$update public.character_private set backstory = 'pwn'$$)::int, 1, 'other_player: writes their own private part, and only that row (story 3.6)');
select tests.set_identity('archived');
select is(tests.rows_affected($$update public.character_private set backstory = 'pwn'$$)::int, 0, 'archived: not writable');
select tests.set_identity('temp_password');
select is(tests.rows_affected($$update public.character_private set backstory = 'pwn'$$)::int, 0, 'temp_password: not writable');
select tests.set_identity('non_member');
select is(tests.rows_affected($$update public.character_private set backstory = 'pwn'$$)::int, 0, 'non_member: not writable');
select throws_ok($$insert into public.character_private (character_id) values ('c5000000-0000-4000-8000-000000000005')$$, '42501', null, 'non_member: cannot insert');
select tests.set_identity('anon');
select throws_ok($$update public.character_private set backstory = 'pwn'$$, '42501', null, 'anon: write refused');
select tests.set_identity('dm');
select is(tests.rows_affected($$update public.character_private set backstory = 'by dm' where character_id = 'c1000000-0000-4000-8000-000000000001'$$)::int, 1, 'dm writes a private part');
select ok((select updated_at from public.character_private where character_id = 'c1000000-0000-4000-8000-000000000001') is not null, 'updated_at kept');

-- ---------------------------------------------------------------------------
-- session_dm: the DM and nobody else
-- ---------------------------------------------------------------------------
select tests.set_identity('anon');
select throws_ok($$select * from public.session_dm$$, '42501', null, 'anon: session_dm refused');
select throws_ok($$update public.session_dm set notes = 'pwn'$$, '42501', null, 'anon: session_dm write refused');

select tests.set_identity('owner');
select is((select count(*)::int from public.session_dm), 0, 'owner: session_dm invisible');
select is(tests.rows_affected($$update public.session_dm set notes = 'pwn'$$)::int, 0, 'owner: session_dm not writable');
select is(tests.rows_affected($$delete from public.session_dm$$)::int, 0, 'owner: session_dm not deletable');
select throws_ok($$insert into public.session_dm (session_id) values ('51000000-0000-4000-8000-000000000001')$$, '42501', null, 'owner: cannot insert');
select tests.set_identity('other_player');
select is((select count(*)::int from public.session_dm), 0, 'other_player: session_dm invisible');
select is(tests.rows_affected($$update public.session_dm set notes = 'pwn'$$)::int, 0, 'other_player: not writable');
select tests.set_identity('archived');
select is((select count(*)::int from public.session_dm), 0, 'archived: session_dm invisible');
select is(tests.rows_affected($$update public.session_dm set notes = 'pwn'$$)::int, 0, 'archived: not writable');
select tests.set_identity('temp_password');
select is((select count(*)::int from public.session_dm), 0, 'temp_password: session_dm invisible');
select is(tests.rows_affected($$update public.session_dm set notes = 'pwn'$$)::int, 0, 'temp_password: not writable');
select tests.set_identity('non_member');
select is((select count(*)::int from public.session_dm), 0, 'non_member: session_dm invisible');
select is(tests.rows_affected($$delete from public.session_dm$$)::int, 0, 'non_member: not deletable');

select tests.set_identity('dm');
select is((select notes from public.session_dm), 'DM SESSION SECRET', 'dm reads session_dm');
select is(tests.rows_affected($$update public.session_dm set experience_awarded = 400$$)::int, 1, 'dm writes session_dm');
select is((select loot from public.session_dm), '[{"item":"gem"}]'::jsonb, 'loot survives as jsonb');

-- ---------------------------------------------------------------------------
-- Review additions: ownership guard, removed membership, more operations, structure
-- ---------------------------------------------------------------------------
select tests.reset_identity();
delete from public.campaign_members where user_id = tests.uid('other_player');
select tests.set_identity('other_player');
select is((select count(*)::int from public.character_private), 0, 'an owner removed from the campaign loses access to their private part');

select tests.set_identity('owner');
select is(tests.rows_affected($$update public.characters set owner_user_id = tests.uid('owner') where id = 'c2000000-0000-4000-8000-000000000002'$$)::int, 0, 'a player cannot take over another character (0 rows: not theirs)');
select throws_ok($$update public.characters set owner_user_id = null where id = 'c1000000-0000-4000-8000-000000000001'$$, '42501', null, 'a player cannot disown their own character (the guard refuses)');
select throws_ok($$update public.characters set archived_with_owner = true where id = 'c1000000-0000-4000-8000-000000000001'$$, '42501', null, 'a player cannot flip archived_with_owner (the guard refuses)');
select is(
  tests.rows_affected($$update public.characters set name = 'Alice renamed' where id = 'c1000000-0000-4000-8000-000000000001'$$)::int, 1,
  'a player can rename their own character (story 3.1)'
);
select tests.set_identity('non_member');
select is(tests.rows_affected($$update public.characters set owner_user_id = tests.uid('non_member')$$)::int, 0, 'a non-member cannot take characters either (0 rows)');
select tests.set_identity('anon');
select throws_ok(
  $$update public.characters set owner_user_id = null$$,
  '42501', null, 'anon cannot reassign characters'
);
select tests.set_identity('dm');
select is(
  tests.rows_affected($$update public.characters set owner_user_id = tests.uid('owner') where id = 'c5000000-0000-4000-8000-000000000005'$$)::int, 1,
  'the DM assigns an owner'
);
select tests.reset_identity();
select lives_ok(
  $$update public.characters set archived_with_owner = true where id = 'c5000000-0000-4000-8000-000000000005'$$,
  'a privileged server-side role (account-admin) can flag characters'
);

-- More operations on the private tables
select tests.set_identity('other_player');
select is(tests.rows_affected($$delete from public.character_private$$)::int, 0, 'other_player: character_private not deletable');
select tests.set_identity('archived');
select is(tests.rows_affected($$delete from public.character_private$$)::int, 0, 'archived: character_private not deletable');
select throws_ok($$insert into public.character_private (character_id) values ('c5000000-0000-4000-8000-000000000005')$$, '42501', null, 'archived: cannot insert');
select tests.set_identity('temp_password');
select is(tests.rows_affected($$delete from public.character_private$$)::int, 0, 'temp_password: character_private not deletable');
select throws_ok($$insert into public.character_private (character_id) values ('c5000000-0000-4000-8000-000000000005')$$, '42501', null, 'temp_password: cannot insert');
select tests.set_identity('anon');
select throws_ok($$delete from public.character_private$$, '42501', null, 'anon: character_private delete refused');
select throws_ok($$insert into public.session_dm (session_id) values ('51000000-0000-4000-8000-000000000001')$$, '42501', null, 'anon: session_dm insert refused');
select throws_ok($$delete from public.session_dm$$, '42501', null, 'anon: session_dm delete refused');
select tests.set_identity('other_player');
select throws_ok($$insert into public.session_dm (session_id) values ('51000000-0000-4000-8000-000000000001')$$, '42501', null, 'other_player: session_dm insert refused');
select is(tests.rows_affected($$delete from public.session_dm$$)::int, 0, 'other_player: session_dm not deletable');
select tests.set_identity('archived');
select throws_ok($$insert into public.session_dm (session_id) values ('51000000-0000-4000-8000-000000000001')$$, '42501', null, 'archived: session_dm insert refused');
select is(tests.rows_affected($$delete from public.session_dm$$)::int, 0, 'archived: session_dm not deletable');
select tests.set_identity('temp_password');
select throws_ok($$insert into public.session_dm (session_id) values ('51000000-0000-4000-8000-000000000001')$$, '42501', null, 'temp_password: session_dm insert refused');
select is(tests.rows_affected($$delete from public.session_dm$$)::int, 0, 'temp_password: session_dm not deletable');
select tests.set_identity('non_member');
select throws_ok($$insert into public.session_dm (session_id) values ('51000000-0000-4000-8000-000000000001')$$, '42501', null, 'non_member: session_dm insert refused');

-- DM: insert and delete controls, and updated_at really moves
select tests.reset_identity();
update public.character_private set updated_at = '2000-01-01' where character_id = 'c2000000-0000-4000-8000-000000000002';
select tests.set_identity('dm');
select is(tests.rows_affected($$update public.character_private set notes = 'touched' where character_id = 'c2000000-0000-4000-8000-000000000002'$$)::int, 1, 'dm touches a private part');
select ok((select updated_at from public.character_private where character_id = 'c2000000-0000-4000-8000-000000000002') > '2000-01-01', 'the trigger moved updated_at');
select is(tests.rows_affected($$delete from public.character_private where character_id = 'c2000000-0000-4000-8000-000000000002'$$)::int, 1, 'dm deletes a private part');
select lives_ok($$insert into public.character_private (character_id, backstory) values ('c2000000-0000-4000-8000-000000000002', 'rewritten')$$, 'dm inserts a private part');
select is(tests.rows_affected($$delete from public.session_dm$$)::int, 1, 'dm deletes session_dm');
select lives_ok($$insert into public.session_dm (session_id, notes) values ('51000000-0000-4000-8000-000000000001', 'again')$$, 'dm inserts session_dm');

-- Trigger functions: definer, empty search_path, not callable
select tests.reset_identity();
select is(
  (select count(*)::int from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('create_character_private_row', 'create_session_dm_row', 'create_campaign_dm_row')
      and p.prosecdef and p.proconfig = array['search_path=""']
      and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not has_function_privilege('anon', p.oid, 'EXECUTE')),
  3, 'the row-creating trigger functions are SECURITY DEFINER, pinned, and not callable'
);
select ok(
  not has_function_privilege('authenticated', 'public.guard_character_ownership()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.guard_character_ownership()', 'EXECUTE'),
  'the ownership guard is not callable'
);


-- The ownership guard in isolation: epic 3 will give players an UPDATE policy on characters; simulate
-- one here (transaction-local) and check the guard still refuses ownership changes.
select tests.reset_identity();
create policy tmp_players_update on public.characters for all to authenticated using (true) with check (true);
select tests.set_identity('owner');
select throws_ok($$update public.characters set owner_user_id = tests.uid('owner') where id = 'c2000000-0000-4000-8000-000000000002'$$, '42501', null, 'guard: a player cannot take over another character');
select throws_ok($$update public.characters set owner_user_id = null where id = 'c1000000-0000-4000-8000-000000000001'$$, '42501', null, 'guard: a player cannot disown their character');
select throws_ok($$update public.characters set archived_with_owner = true where id = 'c1000000-0000-4000-8000-000000000001'$$, '42501', null, 'guard: a player cannot flip archived_with_owner');
select is(tests.rows_affected($$update public.characters set name = 'Alice renamed' where id = 'c1000000-0000-4000-8000-000000000001'$$)::int, 1, 'guard: ordinary updates still pass');
select tests.set_identity('anon');
select throws_ok($$update public.characters set owner_user_id = null$$, '42501', null, 'anon is refused (no privilege)');
select tests.reset_identity();
drop policy tmp_players_update on public.characters;

-- ---------------------------------------------------------------------------
-- Cascade and trigger positive controls (privileged)
-- ---------------------------------------------------------------------------
select tests.reset_identity();
select lives_ok($$insert into public.characters (id, campaign_id, name, character_type) values ('c6000000-0000-4000-8000-000000000006', 'aaaaaaaa-0000-4000-8000-00000000000a', 'New', 'pc')$$, 'a character can be created');
select is((select count(*)::int from public.character_private where character_id = 'c6000000-0000-4000-8000-000000000006'), 1, 'its private row appeared');
select lives_ok($$insert into public.sessions (id, campaign_id, session_number) values ('52000000-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-00000000000a', 2)$$, 'a session can be created');
select is((select count(*)::int from public.session_dm where session_id = '52000000-0000-4000-8000-000000000002'), 1, 'its DM row appeared');
select lives_ok($$delete from public.characters where id = 'c6000000-0000-4000-8000-000000000006'$$, 'deleting a character...');
select is((select count(*)::int from public.character_private where character_id = 'c6000000-0000-4000-8000-000000000006'), 0, '...removes its private row');
select lives_ok($$delete from auth.users where id = tests.uid('owner')$$, 'deleting an account...');
select is((select owner_user_id from public.characters where id = 'c1000000-0000-4000-8000-000000000001'), null, '...leaves the character, ownerless (SET NULL)');

select * from finish();
rollback;
