-- Story 1.6 (AD-1, AD-4, AD-14): characters, character_build_levels and character_items are
-- DM-only. Generated matrix: 7 identities x 3 tables x 4 operations (see structure checks first).
begin;

select plan(107);

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

insert into public.campaigns (id, name) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Campaign A');
insert into public.campaign_members (campaign_id, user_id)
values ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('owner')), ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('other_player')),
       ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('archived')), ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('temp_password'));

insert into public.characters (id, campaign_id, name, character_type, owner_user_id)
values ('c1000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Alice PC', 'pc', tests.uid('owner')),
       ('c2000000-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Bob PC', 'pc', tests.uid('other_player'));
insert into public.character_build_levels (character_id, sequence, class_id, class_level)
values ('c1000000-0000-4000-8000-000000000001', 1, 'fighter', 1);
insert into public.character_items (character_id, item_id) values ('c1000000-0000-4000-8000-000000000001', 'longsword');

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_class where oid in ('public.characters'::regclass, 'public.character_build_levels'::regclass, 'public.character_items'::regclass) and relrowsecurity),
  3, 'row-level security is enabled on the three tables'
);
select policies_are('public', 'characters', array['characters_dm_all', 'access_active'], 'characters: exactly the DM policy and the active-user rule');
select policies_are('public', 'character_build_levels', array['character_build_levels_dm_all', 'access_active'], 'character_build_levels: exactly the DM policy and the active-user rule');
select policies_are('public', 'character_items', array['character_items_dm_all', 'access_active'], 'character_items: exactly the DM policy and the active-user rule');
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename in ('characters', 'character_build_levels', 'character_items')
      and policyname like '%_dm_all' and permissive = 'PERMISSIVE' and qual = 'is_dm()' and with_check = 'is_dm()'),
  3, 'the DM policies are exactly is_dm()'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename in ('characters', 'character_build_levels', 'character_items')
      and policyname = 'access_active' and permissive = 'RESTRICTIVE' and roles = '{authenticated}'
      and cmd = 'ALL' and qual = '(is_dm() OR is_active_user())'),
  3, 'the restrictive active-user policy is on every table'
);
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name in ('characters', 'character_build_levels', 'character_items')
      and grantee in ('anon', 'PUBLIC')),
  0, 'anon and PUBLIC hold no privilege on the three tables'
);
select ok(
  not has_table_privilege('authenticated', 'public.characters', 'TRUNCATE')
  and not has_table_privilege('authenticated', 'public.character_build_levels', 'TRUNCATE')
  and not has_table_privilege('authenticated', 'public.character_items', 'TRUNCATE')
  and not has_table_privilege('authenticated', 'public.characters', 'REFERENCES')
  and not has_table_privilege('authenticated', 'public.characters', 'TRIGGER')
  and not has_table_privilege('authenticated', 'public.character_build_levels', 'REFERENCES')
  and not has_table_privilege('authenticated', 'public.character_items', 'TRIGGER')
  and not has_any_column_privilege('anon', 'public.characters', 'SELECT')
  and not has_any_column_privilege('anon', 'public.character_build_levels', 'SELECT')
  and not has_any_column_privilege('anon', 'public.character_items', 'SELECT'),
  'no TRUNCATE for authenticated, no column privilege for anon'
);

-- ---------------- anon
select tests.set_identity('anon');
select throws_ok($$select * from public.characters$$, '42501', null, 'anon: characters read refused');
select throws_ok($$insert into public.characters (campaign_id, name, character_type) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Hijack', 'pc')$$, '42501', null, 'anon: characters insert refused');
select throws_ok($$update public.characters set name = 'Pwned'$$, '42501', null, 'anon: characters update refused');
select throws_ok($$delete from public.characters$$, '42501', null, 'anon: characters delete refused');
select throws_ok($$select * from public.character_build_levels$$, '42501', null, 'anon: character_build_levels read refused');
select throws_ok($$insert into public.character_build_levels (character_id, sequence, class_id, class_level) values ('c1000000-0000-4000-8000-000000000001', 2, 'fighter', 2)$$, '42501', null, 'anon: character_build_levels insert refused');
select throws_ok($$update public.character_build_levels set class_level = 9$$, '42501', null, 'anon: character_build_levels update refused');
select throws_ok($$delete from public.character_build_levels$$, '42501', null, 'anon: character_build_levels delete refused');
select throws_ok($$select * from public.character_items$$, '42501', null, 'anon: character_items read refused');
select throws_ok($$insert into public.character_items (character_id, item_id) values ('c1000000-0000-4000-8000-000000000001', 'dagger')$$, '42501', null, 'anon: character_items insert refused');
select throws_ok($$update public.character_items set quantity = 99$$, '42501', null, 'anon: character_items update refused');
select throws_ok($$delete from public.character_items$$, '42501', null, 'anon: character_items delete refused');
-- ---------------- owner
select tests.set_identity('owner');
select is((select count(*)::int from public.characters), 0, 'owner: characters invisible');
select throws_ok($$insert into public.characters (campaign_id, name, character_type) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Hijack', 'pc')$$, '42501', null, 'owner: characters insert refused');
select is(tests.rows_affected($$update public.characters set name = 'Pwned'$$)::int, 0, 'owner: characters update touches 0 rows');
select is(tests.rows_affected($$delete from public.characters$$)::int, 0, 'owner: characters delete touches 0 rows');
select is((select count(*)::int from public.character_build_levels), 0, 'owner: character_build_levels invisible');
select throws_ok($$insert into public.character_build_levels (character_id, sequence, class_id, class_level) values ('c1000000-0000-4000-8000-000000000001', 2, 'fighter', 2)$$, '42501', null, 'owner: character_build_levels insert refused');
select is(tests.rows_affected($$update public.character_build_levels set class_level = 9$$)::int, 0, 'owner: character_build_levels update touches 0 rows');
select is(tests.rows_affected($$delete from public.character_build_levels$$)::int, 0, 'owner: character_build_levels delete touches 0 rows');
select is((select count(*)::int from public.character_items), 0, 'owner: character_items invisible');
select throws_ok($$insert into public.character_items (character_id, item_id) values ('c1000000-0000-4000-8000-000000000001', 'dagger')$$, '42501', null, 'owner: character_items insert refused');
select is(tests.rows_affected($$update public.character_items set quantity = 99$$)::int, 0, 'owner: character_items update touches 0 rows');
select is(tests.rows_affected($$delete from public.character_items$$)::int, 0, 'owner: character_items delete touches 0 rows');
-- ---------------- other_player
select tests.set_identity('other_player');
select is((select count(*)::int from public.characters), 0, 'other_player: characters invisible');
select throws_ok($$insert into public.characters (campaign_id, name, character_type) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Hijack', 'pc')$$, '42501', null, 'other_player: characters insert refused');
select is(tests.rows_affected($$update public.characters set name = 'Pwned'$$)::int, 0, 'other_player: characters update touches 0 rows');
select is(tests.rows_affected($$delete from public.characters$$)::int, 0, 'other_player: characters delete touches 0 rows');
select is((select count(*)::int from public.character_build_levels), 0, 'other_player: character_build_levels invisible');
select throws_ok($$insert into public.character_build_levels (character_id, sequence, class_id, class_level) values ('c1000000-0000-4000-8000-000000000001', 2, 'fighter', 2)$$, '42501', null, 'other_player: character_build_levels insert refused');
select is(tests.rows_affected($$update public.character_build_levels set class_level = 9$$)::int, 0, 'other_player: character_build_levels update touches 0 rows');
select is(tests.rows_affected($$delete from public.character_build_levels$$)::int, 0, 'other_player: character_build_levels delete touches 0 rows');
select is((select count(*)::int from public.character_items), 0, 'other_player: character_items invisible');
select throws_ok($$insert into public.character_items (character_id, item_id) values ('c1000000-0000-4000-8000-000000000001', 'dagger')$$, '42501', null, 'other_player: character_items insert refused');
select is(tests.rows_affected($$update public.character_items set quantity = 99$$)::int, 0, 'other_player: character_items update touches 0 rows');
select is(tests.rows_affected($$delete from public.character_items$$)::int, 0, 'other_player: character_items delete touches 0 rows');
-- ---------------- archived
select tests.set_identity('archived');
select is((select count(*)::int from public.characters), 0, 'archived: characters invisible');
select throws_ok($$insert into public.characters (campaign_id, name, character_type) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Hijack', 'pc')$$, '42501', null, 'archived: characters insert refused');
select is(tests.rows_affected($$update public.characters set name = 'Pwned'$$)::int, 0, 'archived: characters update touches 0 rows');
select is(tests.rows_affected($$delete from public.characters$$)::int, 0, 'archived: characters delete touches 0 rows');
select is((select count(*)::int from public.character_build_levels), 0, 'archived: character_build_levels invisible');
select throws_ok($$insert into public.character_build_levels (character_id, sequence, class_id, class_level) values ('c1000000-0000-4000-8000-000000000001', 2, 'fighter', 2)$$, '42501', null, 'archived: character_build_levels insert refused');
select is(tests.rows_affected($$update public.character_build_levels set class_level = 9$$)::int, 0, 'archived: character_build_levels update touches 0 rows');
select is(tests.rows_affected($$delete from public.character_build_levels$$)::int, 0, 'archived: character_build_levels delete touches 0 rows');
select is((select count(*)::int from public.character_items), 0, 'archived: character_items invisible');
select throws_ok($$insert into public.character_items (character_id, item_id) values ('c1000000-0000-4000-8000-000000000001', 'dagger')$$, '42501', null, 'archived: character_items insert refused');
select is(tests.rows_affected($$update public.character_items set quantity = 99$$)::int, 0, 'archived: character_items update touches 0 rows');
select is(tests.rows_affected($$delete from public.character_items$$)::int, 0, 'archived: character_items delete touches 0 rows');
-- ---------------- temp_password
select tests.set_identity('temp_password');
select is((select count(*)::int from public.characters), 0, 'temp_password: characters invisible');
select throws_ok($$insert into public.characters (campaign_id, name, character_type) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Hijack', 'pc')$$, '42501', null, 'temp_password: characters insert refused');
select is(tests.rows_affected($$update public.characters set name = 'Pwned'$$)::int, 0, 'temp_password: characters update touches 0 rows');
select is(tests.rows_affected($$delete from public.characters$$)::int, 0, 'temp_password: characters delete touches 0 rows');
select is((select count(*)::int from public.character_build_levels), 0, 'temp_password: character_build_levels invisible');
select throws_ok($$insert into public.character_build_levels (character_id, sequence, class_id, class_level) values ('c1000000-0000-4000-8000-000000000001', 2, 'fighter', 2)$$, '42501', null, 'temp_password: character_build_levels insert refused');
select is(tests.rows_affected($$update public.character_build_levels set class_level = 9$$)::int, 0, 'temp_password: character_build_levels update touches 0 rows');
select is(tests.rows_affected($$delete from public.character_build_levels$$)::int, 0, 'temp_password: character_build_levels delete touches 0 rows');
select is((select count(*)::int from public.character_items), 0, 'temp_password: character_items invisible');
select throws_ok($$insert into public.character_items (character_id, item_id) values ('c1000000-0000-4000-8000-000000000001', 'dagger')$$, '42501', null, 'temp_password: character_items insert refused');
select is(tests.rows_affected($$update public.character_items set quantity = 99$$)::int, 0, 'temp_password: character_items update touches 0 rows');
select is(tests.rows_affected($$delete from public.character_items$$)::int, 0, 'temp_password: character_items delete touches 0 rows');
-- ---------------- non_member
select tests.set_identity('non_member');
select is((select count(*)::int from public.characters), 0, 'non_member: characters invisible');
select throws_ok($$insert into public.characters (campaign_id, name, character_type) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Hijack', 'pc')$$, '42501', null, 'non_member: characters insert refused');
select is(tests.rows_affected($$update public.characters set name = 'Pwned'$$)::int, 0, 'non_member: characters update touches 0 rows');
select is(tests.rows_affected($$delete from public.characters$$)::int, 0, 'non_member: characters delete touches 0 rows');
select is((select count(*)::int from public.character_build_levels), 0, 'non_member: character_build_levels invisible');
select throws_ok($$insert into public.character_build_levels (character_id, sequence, class_id, class_level) values ('c1000000-0000-4000-8000-000000000001', 2, 'fighter', 2)$$, '42501', null, 'non_member: character_build_levels insert refused');
select is(tests.rows_affected($$update public.character_build_levels set class_level = 9$$)::int, 0, 'non_member: character_build_levels update touches 0 rows');
select is(tests.rows_affected($$delete from public.character_build_levels$$)::int, 0, 'non_member: character_build_levels delete touches 0 rows');
select is((select count(*)::int from public.character_items), 0, 'non_member: character_items invisible');
select throws_ok($$insert into public.character_items (character_id, item_id) values ('c1000000-0000-4000-8000-000000000001', 'dagger')$$, '42501', null, 'non_member: character_items insert refused');
select is(tests.rows_affected($$update public.character_items set quantity = 99$$)::int, 0, 'non_member: character_items update touches 0 rows');
select is(tests.rows_affected($$delete from public.character_items$$)::int, 0, 'non_member: character_items delete touches 0 rows');
-- ---------------- access_active in effect: a temporary permissive policy (what epic 3 will add) must still leave archived and temporary-password accounts out
select tests.reset_identity();
create policy tmp_open on public.characters for all to authenticated using (true) with check (true);
create policy tmp_open on public.character_build_levels for all to authenticated using (true) with check (true);
create policy tmp_open on public.character_items for all to authenticated using (true) with check (true);
select tests.set_identity('owner');
select ok((select count(*)::int from public.characters) > 0, 'owner: sees characters once a permissive policy exists');
select ok((select count(*)::int from public.character_build_levels) > 0, 'owner: sees character_build_levels once a permissive policy exists');
select ok((select count(*)::int from public.character_items) > 0, 'owner: sees character_items once a permissive policy exists');
select tests.set_identity('archived');
select is((select count(*)::int from public.characters), 0, 'archived: still sees nothing in characters (restrictive rule)');
select throws_ok($$insert into public.characters (campaign_id, name, character_type) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Hijack', 'pc')$$, '42501', null, 'archived: still cannot insert into characters');
select is((select count(*)::int from public.character_build_levels), 0, 'archived: still sees nothing in character_build_levels (restrictive rule)');
select throws_ok($$insert into public.character_build_levels (character_id, sequence, class_id, class_level) values ('c1000000-0000-4000-8000-000000000001', 2, 'fighter', 2)$$, '42501', null, 'archived: still cannot insert into character_build_levels');
select is((select count(*)::int from public.character_items), 0, 'archived: still sees nothing in character_items (restrictive rule)');
select throws_ok($$insert into public.character_items (character_id, item_id) values ('c1000000-0000-4000-8000-000000000001', 'dagger')$$, '42501', null, 'archived: still cannot insert into character_items');
select tests.set_identity('temp_password');
select is((select count(*)::int from public.characters), 0, 'temp_password: still sees nothing in characters (restrictive rule)');
select throws_ok($$insert into public.characters (campaign_id, name, character_type) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Hijack', 'pc')$$, '42501', null, 'temp_password: still cannot insert into characters');
select is((select count(*)::int from public.character_build_levels), 0, 'temp_password: still sees nothing in character_build_levels (restrictive rule)');
select throws_ok($$insert into public.character_build_levels (character_id, sequence, class_id, class_level) values ('c1000000-0000-4000-8000-000000000001', 2, 'fighter', 2)$$, '42501', null, 'temp_password: still cannot insert into character_build_levels');
select is((select count(*)::int from public.character_items), 0, 'temp_password: still sees nothing in character_items (restrictive rule)');
select throws_ok($$insert into public.character_items (character_id, item_id) values ('c1000000-0000-4000-8000-000000000001', 'dagger')$$, '42501', null, 'temp_password: still cannot insert into character_items');
select tests.reset_identity();
drop policy tmp_open on public.characters;
drop policy tmp_open on public.character_build_levels;
drop policy tmp_open on public.character_items;
-- ---------------- dm (positive controls)
select tests.set_identity('dm');
select is((select count(*)::int from public.characters), 2, 'dm: reads every characters row');
select is((select count(*)::int from public.character_build_levels), 1, 'dm: reads every character_build_levels row');
select is((select count(*)::int from public.character_items), 1, 'dm: reads every character_items row');
select lives_ok($$insert into public.characters (campaign_id, name, character_type) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Hijack', 'pc')$$, 'dm: inserts into characters');
select lives_ok($$insert into public.character_build_levels (character_id, sequence, class_id, class_level) values ('c1000000-0000-4000-8000-000000000001', 2, 'fighter', 2)$$, 'dm: inserts into character_build_levels');
select lives_ok($$insert into public.character_items (character_id, item_id) values ('c1000000-0000-4000-8000-000000000001', 'dagger')$$, 'dm: inserts into character_items');
select ok(tests.rows_affected($$update public.characters set name = 'Pwned'$$)::int >= 1, 'dm: updates characters');
select ok(tests.rows_affected($$update public.character_build_levels set class_level = 9$$)::int >= 1, 'dm: updates character_build_levels');
select ok(tests.rows_affected($$update public.character_items set quantity = 99$$)::int >= 1, 'dm: updates character_items');
select ok(tests.rows_affected($$delete from public.character_items$$)::int >= 1, 'dm: deletes from character_items');
select ok(tests.rows_affected($$delete from public.character_build_levels$$)::int >= 1, 'dm: deletes from character_build_levels');
select ok(tests.rows_affected($$delete from public.characters$$)::int >= 1, 'dm: deletes from characters');

select tests.reset_identity();
select * from finish();
rollback;
