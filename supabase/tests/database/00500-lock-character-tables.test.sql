-- Story 1.6 then 3.1 (AD-1, AD-4, AD-6, AD-14): characters, character_build_levels and character_items.
-- The DM does everything; the OWNER reads and writes their own rows (not the guarded columns); everyone else gets
-- nothing. Matrix over the 7 identities. (Reading the other PCs of a campaign arrives with story 3.7.)
begin;

select plan(87);

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
values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Campaign A'),
       ('bbbbbbbb-0000-4000-8000-00000000000b', 'Campaign B');
insert into public.campaign_members (campaign_id, user_id)
values ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('owner')),
       ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('other_player')),
       ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('archived')),
       ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('temp_password'));

insert into public.characters (id, campaign_id, name, character_type, owner_user_id)
values ('c1000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Alice PC', 'pc', tests.uid('owner')),
       ('c2000000-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Bob PC', 'pc', tests.uid('other_player'));
insert into public.character_build_levels (character_id, sequence, class_id, class_level)
values ('c1000000-0000-4000-8000-000000000001', 1, 'fighter', 1),
       ('c2000000-0000-4000-8000-000000000002', 1, 'wizard', 1);
insert into public.character_items (character_id, item_id)
values ('c1000000-0000-4000-8000-000000000001', 'longsword'),
       ('c2000000-0000-4000-8000-000000000002', 'dagger');

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_class where oid in ('public.characters'::regclass, 'public.character_build_levels'::regclass, 'public.character_items'::regclass) and relrowsecurity),
  3, 'row-level security is enabled on the three tables'
);
select policies_are('public', 'characters',
  array['characters_dm_all', 'characters_owner_select', 'characters_owner_insert', 'characters_owner_update', 'access_active'],
  'characters: the DM policy, the three owner policies and the active-user rule (no DELETE for a player)');
select policies_are('public', 'character_build_levels',
  array['character_build_levels_dm_all', 'character_build_levels_owner_all', 'access_active'],
  'character_build_levels: DM, owner, active-user rule');
select policies_are('public', 'character_items',
  array['character_items_dm_all', 'character_items_owner_all', 'access_active'],
  'character_items: DM, owner, active-user rule');
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
select is(
  (select array_agg(t.tgname::text order by t.tgname)
     from pg_trigger t
    where t.tgrelid = 'public.characters'::regclass and not t.tgisinternal
      and t.tgname in ('characters_guard_ownership', 'characters_manage_slug', 'characters_zz_clear_archive_mark')),
  array['characters_guard_ownership', 'characters_manage_slug', 'characters_zz_clear_archive_mark'],
  'the guard trigger sorts (and so fires) before the slug trigger and before the archive-mark trigger'
);
select ok(
  (select (t.tgtype & 4) <> 0 and (t.tgtype & 16) <> 0 and (t.tgtype & 2) <> 0 from pg_trigger t
    where t.tgrelid = 'public.characters'::regclass and t.tgname = 'characters_guard_ownership'),
  'the guard is a BEFORE trigger on INSERT and UPDATE'
);

-- ---------------------------------------------------------------------------
-- anon: nothing at all
-- ---------------------------------------------------------------------------
select tests.set_identity('anon');
select throws_ok($$select * from public.characters$$, '42501', null, 'anon: characters read refused');
select throws_ok($$select * from public.character_items$$, '42501', null, 'anon: character_items read refused');
select throws_ok($$select * from public.character_build_levels$$, '42501', null, 'anon: character_build_levels read refused');
select throws_ok($$insert into public.characters (campaign_id, name, character_type) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'X', 'pc')$$, '42501', null, 'anon: insert refused');
select throws_ok($$update public.characters set name = 'X'$$, '42501', null, 'anon: update refused');
select throws_ok($$delete from public.characters$$, '42501', null, 'anon: delete refused');

-- ---------------------------------------------------------------------------
-- Identities that see nothing: archived, temp_password, non_member (the first two ARE members of campaign A)
-- ---------------------------------------------------------------------------
select tests.set_identity('non_member');
select is((select count(*)::int from public.characters), 0, 'non_member: characters invisible');
select is((select count(*)::int from public.character_items), 0, 'non_member: character_items invisible');
select is((select count(*)::int from public.character_build_levels), 0, 'non_member: character_build_levels invisible');
select throws_ok($$insert into public.characters (campaign_id, name, character_type, owner_user_id) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'X', 'pc', auth.uid())$$, '42501', null, 'non_member: cannot create a character in a campaign they are not in');
select is(tests.rows_affected($$update public.characters set name = 'X'$$)::int, 0, 'non_member: update touches 0 rows');
select is(tests.rows_affected($$delete from public.characters$$)::int, 0, 'non_member: delete touches 0 rows');
select throws_ok($$insert into public.character_items (character_id, item_id) values ('c1000000-0000-4000-8000-000000000001', 'dagger')$$, '42501', null, 'non_member: no item on someone else''s character');
select throws_ok($$insert into public.character_build_levels (character_id, sequence, class_id, class_level) values ('c1000000-0000-4000-8000-000000000001', 2, 'fighter', 2)$$, '42501', null, 'non_member: no level on someone else''s character');

select tests.set_identity('archived');
select is((select count(*)::int from public.characters), 0, 'archived: characters invisible');
select is((select count(*)::int from public.character_items), 0, 'archived: character_items invisible');
select is((select count(*)::int from public.character_build_levels), 0, 'archived: character_build_levels invisible');
select throws_ok($$insert into public.characters (campaign_id, name, character_type, owner_user_id) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'X', 'pc', auth.uid())$$, '42501', null, 'archived: cannot create');
select is(tests.rows_affected($$update public.characters set name = 'X'$$)::int, 0, 'archived: update touches 0 rows');

select tests.set_identity('temp_password');
select is((select count(*)::int from public.characters), 0, 'temp_password: characters invisible');
select is((select count(*)::int from public.character_items), 0, 'temp_password: character_items invisible');
select is((select count(*)::int from public.character_build_levels), 0, 'temp_password: character_build_levels invisible');
select throws_ok($$insert into public.characters (campaign_id, name, character_type, owner_user_id) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'X', 'pc', auth.uid())$$, '42501', null, 'temp_password: cannot create');

-- ---------------------------------------------------------------------------
-- owner (Alice, member of A, owns C1)
-- ---------------------------------------------------------------------------
select tests.set_identity('owner');
select is((select count(*)::int from public.characters), 1, 'owner: sees exactly their character');
select is((select name from public.characters), 'Alice PC', 'owner: and it is theirs');
select is((select count(*)::int from public.character_items), 1, 'owner: sees only their inventory');
select is((select count(*)::int from public.character_build_levels), 1, 'owner: sees only their level history');

select is(tests.rows_affected($$update public.characters set name = 'Alice renamed', hit_points_max = 12 where id = 'c1000000-0000-4000-8000-000000000001'$$)::int, 1, 'owner: updates their character');
select is((select slug <> '' from public.characters where id = 'c1000000-0000-4000-8000-000000000001'), true, 'owner: a rename still gets a server-made slug');
select is(tests.rows_affected($$update public.characters set status = 'ready' where id = 'c1000000-0000-4000-8000-000000000001'$$)::int, 1, 'owner: can finalise');
select is(tests.rows_affected($$update public.characters set status = 'draft' where id = 'c1000000-0000-4000-8000-000000000001'$$)::int, 1, 'owner: can go back to draft (rebuild)');
select is(tests.rows_affected($$update public.characters set name = 'Pwned' where id = 'c2000000-0000-4000-8000-000000000002'$$)::int, 0, 'owner: updating another player''s character touches 0 rows');
select is(tests.rows_affected($$delete from public.characters where id = 'c1000000-0000-4000-8000-000000000001'$$)::int, 0, 'owner: cannot delete even their own character');

select throws_ok($$update public.characters set owner_user_id = null where id = 'c1000000-0000-4000-8000-000000000001'$$, '42501', null, 'owner: cannot give the character away');
select throws_ok($$update public.characters set campaign_id = 'bbbbbbbb-0000-4000-8000-00000000000b' where id = 'c1000000-0000-4000-8000-000000000001'$$, '42501', null, 'owner: cannot move it to another campaign');
select throws_ok($$update public.characters set character_type = 'npc' where id = 'c1000000-0000-4000-8000-000000000001'$$, '42501', null, 'owner: cannot make it an NPC');
select throws_ok($$update public.characters set is_active = false where id = 'c1000000-0000-4000-8000-000000000001'$$, '42501', null, 'owner: cannot deactivate it');
select throws_ok($$update public.characters set archived_with_owner = true where id = 'c1000000-0000-4000-8000-000000000001'$$, '42501', null, 'owner: cannot set the archive mark');
select throws_ok($$update public.characters set slug = 'chosen-slug' where id = 'c1000000-0000-4000-8000-000000000001'$$, '42501', null, 'owner: cannot choose a slug');
select throws_ok($$update public.characters set previous_slugs = array['x'] where id = 'c1000000-0000-4000-8000-000000000001'$$, '42501', null, 'owner: cannot edit previous_slugs');
select throws_ok($$update public.characters set id = 'c9000000-0000-4000-8000-000000000009' where id = 'c1000000-0000-4000-8000-000000000001'$$, '42501', null, 'owner: cannot change the id');

select lives_ok($$insert into public.characters (id, campaign_id, name, character_type, owner_user_id) values ('c3000000-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Second PC', 'pc', auth.uid())$$, 'owner: creates a character of their own in their campaign');
select is((select slug <> '' from public.characters where id = 'c3000000-0000-4000-8000-000000000003'), true, 'owner: its slug was generated by the server');
select throws_ok($$insert into public.characters (campaign_id, name, character_type, owner_user_id) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'X', 'pc', tests.uid('other_player'))$$, '42501', null, 'owner: cannot create a character owned by someone else');
select throws_ok($$insert into public.characters (campaign_id, name, character_type, owner_user_id) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'X', 'npc', auth.uid())$$, '42501', null, 'owner: cannot create an NPC');
select throws_ok($$insert into public.characters (campaign_id, name, character_type) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'X', 'pc')$$, '42501', null, 'owner: cannot create an unowned character');
select throws_ok($$insert into public.characters (campaign_id, name, character_type, owner_user_id, slug) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'X', 'pc', auth.uid(), 'my-slug')$$, '42501', null, 'owner: cannot choose a slug at creation');
select throws_ok($$insert into public.characters (campaign_id, name, character_type, owner_user_id, is_active) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'X', 'pc', auth.uid(), false)$$, '42501', null, 'owner: cannot create an inactive character');
select throws_ok($$insert into public.characters (campaign_id, name, character_type, owner_user_id) values ('bbbbbbbb-0000-4000-8000-00000000000b', 'X', 'pc', auth.uid())$$, '42501', null, 'owner: cannot create in a campaign they are not a member of');

select lives_ok($$insert into public.character_items (character_id, item_id) values ('c1000000-0000-4000-8000-000000000001', 'dagger')$$, 'owner: adds an item to their character');
select is(tests.rows_affected($$update public.character_items set quantity = 3 where character_id = 'c1000000-0000-4000-8000-000000000001'$$)::int, 2, 'owner: updates their items');
select is(tests.rows_affected($$delete from public.character_items where item_id = 'dagger' and character_id = 'c1000000-0000-4000-8000-000000000001'$$)::int, 1, 'owner: deletes their items');
select throws_ok($$insert into public.character_items (character_id, item_id) values ('c2000000-0000-4000-8000-000000000002', 'rope')$$, '42501', null, 'owner: cannot add an item to another player''s character');
select is(tests.rows_affected($$update public.character_items set quantity = 99 where character_id = 'c2000000-0000-4000-8000-000000000002'$$)::int, 0, 'owner: cannot update another player''s items');
select is(tests.rows_affected($$delete from public.character_items where character_id = 'c2000000-0000-4000-8000-000000000002'$$)::int, 0, 'owner: cannot delete another player''s items');
select lives_ok($$insert into public.character_build_levels (character_id, sequence, class_id, class_level) values ('c1000000-0000-4000-8000-000000000001', 2, 'fighter', 2)$$, 'owner: records a level');
select is(tests.rows_affected($$update public.character_build_levels set class_level = 3 where sequence = 2 and character_id = 'c1000000-0000-4000-8000-000000000001'$$)::int, 1, 'owner: updates their level history');
select is(tests.rows_affected($$delete from public.character_build_levels where sequence = 2 and character_id = 'c1000000-0000-4000-8000-000000000001'$$)::int, 1, 'owner: deletes their level history');
select throws_ok($$insert into public.character_build_levels (character_id, sequence, class_id, class_level) values ('c2000000-0000-4000-8000-000000000002', 2, 'wizard', 2)$$, '42501', null, 'owner: cannot add a level to another player''s character');
select is(tests.rows_affected($$update public.character_build_levels set class_level = 9 where character_id = 'c2000000-0000-4000-8000-000000000002'$$)::int, 0, 'owner: cannot update another player''s levels');
select is(tests.rows_affected($$delete from public.character_build_levels where character_id = 'c2000000-0000-4000-8000-000000000002'$$)::int, 0, 'owner: cannot delete another player''s levels');

-- ---------------------------------------------------------------------------
-- other_player (Bob, member of A, owns C2): the mirror image
-- ---------------------------------------------------------------------------
select tests.set_identity('other_player');
select is((select name from public.characters), 'Bob PC', 'other_player: sees only their own character');
select is(tests.rows_affected($$update public.characters set name = 'Pwned' where id = 'c1000000-0000-4000-8000-000000000001'$$)::int, 0, 'other_player: cannot update Alice''s character');
select throws_ok($$insert into public.character_items (character_id, item_id) values ('c1000000-0000-4000-8000-000000000001', 'rope')$$, '42501', null, 'other_player: cannot add to Alice''s inventory');

-- ---------------------------------------------------------------------------
-- A player removed from the campaign loses the access to their own character at once.
-- ---------------------------------------------------------------------------
select tests.reset_identity();
delete from public.campaign_members where user_id = tests.uid('other_player');
select tests.set_identity('other_player');
select is((select count(*)::int from public.characters), 0, 'a player removed from the campaign no longer sees their character');
select is(tests.rows_affected($$update public.characters set name = 'Still mine' where id = 'c2000000-0000-4000-8000-000000000002'$$)::int, 0, '...nor writes it');
select tests.reset_identity();
insert into public.campaign_members (campaign_id, user_id) values ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('other_player'));

-- ---------------------------------------------------------------------------
-- access_active in effect: a temporary permissive policy must still leave archived / temporary accounts out
-- ---------------------------------------------------------------------------
select tests.reset_identity();
create policy tmp_open on public.characters for all to authenticated using (true) with check (true);
select tests.set_identity('archived');
select is((select count(*)::int from public.characters), 0, 'archived: still sees nothing once a permissive policy exists (restrictive rule)');
select tests.set_identity('temp_password');
select is((select count(*)::int from public.characters), 0, 'temp_password: still sees nothing (restrictive rule)');
select tests.reset_identity();
drop policy tmp_open on public.characters;

-- ---------------------------------------------------------------------------
-- dm: everything, guarded columns included (positive controls)
-- ---------------------------------------------------------------------------
select tests.set_identity('dm');
select is((select count(*)::int from public.characters), 3, 'dm: reads every character');
select is((select count(*)::int from public.character_items), 2, 'dm: reads every item');
select is((select count(*)::int from public.character_build_levels), 2, 'dm: reads every level');
select is(tests.rows_affected($$update public.characters set owner_user_id = tests.uid('owner'), is_active = false, archived_with_owner = true where id = 'c2000000-0000-4000-8000-000000000002'$$)::int, 1, 'dm: changes owner, activation and archive mark');
select lives_ok($$insert into public.characters (campaign_id, name, character_type) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Innkeeper', 'npc')$$, 'dm: creates an NPC');
select lives_ok($$insert into public.characters (id, campaign_id, name, character_type, slug) values ('c5000000-0000-4000-8000-000000000005', 'bbbbbbbb-0000-4000-8000-00000000000b', 'Elsewhere', 'pc', 'dm-chosen-slug')$$, 'dm: can set a slug');
select is(tests.rows_affected($$insert into public.character_items (character_id, item_id) values ('c2000000-0000-4000-8000-000000000002', 'rope')$$)::int, 1, 'dm: inserts an item anywhere');
select is(tests.rows_affected($$update public.character_items set quantity = 5$$)::int, 3, 'dm: updates items');
select is(tests.rows_affected($$delete from public.character_items$$)::int, 3, 'dm: deletes items');
select is(tests.rows_affected($$delete from public.character_build_levels$$)::int, 2, 'dm: deletes levels');
select is(tests.rows_affected($$delete from public.characters$$)::int, 5, 'dm: deletes characters');

select tests.reset_identity();
select * from finish();
rollback;
