-- Stories 3.6, 3.7, 3.9 (D-15): who reads what of a character, the private part of the sheet, reassignment.
begin;

select plan(65);

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

-- C1 Alice (owner), C2 Bob (other_player), C3 NPC of A, C4 PC of A disabled with its archived owner, C5 PC of B.
insert into public.characters (id, campaign_id, name, character_type, owner_user_id, is_active, archived_with_owner)
values ('c1000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Alice PC', 'pc', tests.uid('owner'), true, false),
       ('c2000000-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Bob PC', 'pc', tests.uid('other_player'), true, false),
       ('c3000000-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Innkeeper NPC', 'npc', null, true, false),
       ('c4000000-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Carol PC', 'pc', tests.uid('archived'), false, true),
       ('c5000000-0000-4000-8000-000000000005', 'bbbbbbbb-0000-4000-8000-00000000000b', 'Elsewhere PC', 'pc', null, true, false);
insert into public.character_items (character_id, item_id)
select id, 'item-' || left(id::text, 2) from public.characters;
insert into public.character_build_levels (character_id, sequence, class_id, class_level)
select id, 1, 'fighter', 1 from public.characters;
update public.character_private set backstory = 'SECRET ' || left(character_id::text, 2), notes = 'NOTE ' || left(character_id::text, 2);

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
select policies_are('public', 'character_private',
  array['character_private_dm_all', 'character_private_owner_select', 'character_private_owner_update', 'access_active'],
  'character_private: DM, owner read, owner update, active-user rule (no insert, no delete for a player)');
select ok(
  not has_function_privilege('anon', 'public.can_read_character(uuid)', 'EXECUTE'),
  'anon cannot call can_read_character'
);
select hasnt_column('public', 'characters', 'backstory', 'backstory is not a column of the readable sheet');
select hasnt_column('public', 'characters', 'notes', 'notes is not a column of the readable sheet');

-- ---------------------------------------------------------------------------
-- A member sees the PCs of their campaign (3.7)
-- ---------------------------------------------------------------------------
select tests.set_identity('owner');
select is(
  (select array_agg(name order by name) from public.characters),
  array['Alice PC', 'Bob PC', 'Carol PC'],
  'owner: sees the PCs of campaign A (an archived PC included), no NPC, nothing of campaign B'
);
select is((select count(*)::int from public.characters where id = 'c3000000-0000-4000-8000-000000000003'), 0, 'owner: the NPC is invisible even by id');
select is((select count(*)::int from public.characters where id = 'c5000000-0000-4000-8000-000000000005'), 0, 'owner: a PC of another campaign is invisible even by id');
select is((select count(*)::int from public.character_items), 3, 'owner: reads the inventory of the three PCs, not of the NPC nor of campaign B');
select is((select count(*)::int from public.character_build_levels), 3, 'owner: same for the level history');
select is(tests.rows_affected($$update public.characters set name = 'Pwned' where id = 'c2000000-0000-4000-8000-000000000002'$$)::int, 0, 'owner: another PC is read-only');
select is(tests.rows_affected($$update public.characters set name = 'Pwned' where id = 'c4000000-0000-4000-8000-000000000004'$$)::int, 0, 'owner: an archived PC is read-only');
select is(tests.rows_affected($$update public.character_items set quantity = 9 where character_id = 'c2000000-0000-4000-8000-000000000002'$$)::int, 0, 'owner: another PC''s inventory is read-only');
select is(tests.rows_affected($$delete from public.character_build_levels where character_id = 'c2000000-0000-4000-8000-000000000002'$$)::int, 0, 'owner: another PC''s levels cannot be deleted');

select tests.set_identity('other_player');
select is((select count(*)::int from public.characters), 3, 'other_player: sees the same three PCs');
select is((select count(*)::int from public.characters where character_type = 'npc'), 0, 'other_player: no NPC');

-- select * from the API: no private column exists to leak
select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'characters' and column_name in ('backstory', 'notes')),
  0, 'a full select of characters has no backstory or notes to return'
);

select tests.set_identity('non_member');
select is((select count(*)::int from public.characters), 0, 'non_member: sees no character');
select is((select count(*)::int from public.character_items), 0, 'non_member: no item');
select tests.set_identity('archived');
select is((select count(*)::int from public.characters), 0, 'archived: sees no character');
select tests.set_identity('temp_password');
select is((select count(*)::int from public.characters), 0, 'temp_password: sees no character');
select tests.set_identity('anon');
select throws_ok($$select * from public.characters$$, '42501', null, 'anon: refused');
select throws_ok($$select * from public.character_private$$, '42501', null, 'anon: character_private refused');

-- The helper itself (it is callable as an RPC): same answers as the policies, active accounts only.
select tests.set_identity('owner');
select is(public.can_read_character('c2000000-0000-4000-8000-000000000002'), true, 'helper: another PC of my campaign');
select is(public.can_read_character('c4000000-0000-4000-8000-000000000004'), true, 'helper: a PC disabled with its archived owner');
select is(public.can_read_character('c3000000-0000-4000-8000-000000000003'), false, 'helper: an NPC');
select is(public.can_read_character('c5000000-0000-4000-8000-000000000005'), false, 'helper: a PC of a campaign I am not in');
select is(public.can_read_character('99999999-9999-4999-8999-999999999999'), false, 'helper: an unknown id');
select tests.set_identity('non_member');
select is(public.can_read_character('c2000000-0000-4000-8000-000000000002'), false, 'helper: a non-member');
select tests.set_identity('temp_password');
select is(public.can_read_character('c2000000-0000-4000-8000-000000000002'), false, 'helper: an account on a temporary password');
select tests.set_identity('archived');
select is(public.can_read_character('c4000000-0000-4000-8000-000000000004'), false, 'helper: an archived account, even for its own character');
select tests.set_identity('anon');
select throws_ok($$select public.can_read_character('c2000000-0000-4000-8000-000000000002')$$, '42501', null, 'helper: anon cannot call it');

-- A PC the DM deactivated by hand is withdrawn from the table; its owner still reads it (frozen).
select tests.reset_identity();
update public.characters set is_active = false where id = 'c2000000-0000-4000-8000-000000000002';
select tests.set_identity('owner');
select is((select count(*)::int from public.characters where id = 'c2000000-0000-4000-8000-000000000002'), 0, 'a PC deactivated by hand is no longer readable by the other players');
select is((select count(*)::int from public.character_items where character_id = 'c2000000-0000-4000-8000-000000000002'), 0, '...nor its inventory');
select is(public.can_read_character('c2000000-0000-4000-8000-000000000002'), false, '...nor through the helper');
select tests.set_identity('other_player');
select is((select count(*)::int from public.characters where id = 'c2000000-0000-4000-8000-000000000002'), 1, 'its owner still reads it');
select is(tests.rows_affected($$update public.characters set name = 'Frozen' where id = 'c2000000-0000-4000-8000-000000000002'$$)::int, 0, '...but it is frozen');
select is(tests.rows_affected($$update public.character_private set backstory = 'frozen' where character_id = 'c2000000-0000-4000-8000-000000000002'$$)::int, 0, '...including its private part');
select tests.reset_identity();
update public.characters set is_active = true where id = 'c2000000-0000-4000-8000-000000000002';

-- A player removed from the campaign who still owns a character sees nothing of it.
delete from public.campaign_members where user_id = tests.uid('other_player');
select tests.set_identity('other_player');
select is((select count(*)::int from public.characters), 0, 'a removed member reads no character, not even their own');
select tests.reset_identity();
insert into public.campaign_members (campaign_id, user_id) values ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('other_player'));

-- A member of two campaigns reads the PCs of both.
insert into public.campaign_members (campaign_id, user_id) values ('bbbbbbbb-0000-4000-8000-00000000000b', tests.uid('owner'));
select tests.set_identity('owner');
select is((select count(*)::int from public.characters), 4, 'a member of A and B reads the PCs of both');
select is(public.can_read_character('c5000000-0000-4000-8000-000000000005'), true, 'helper: the PC of B once a member of B');
select tests.reset_identity();
delete from public.campaign_members where campaign_id = 'bbbbbbbb-0000-4000-8000-00000000000b';

-- The frozen archived PC: its (archived) owner cannot touch it either, and the other members only read it.
select tests.set_identity('non_member');
select is((select count(*)::int from public.character_build_levels), 0, 'non_member: no level history');
select tests.set_identity('archived');
select is((select count(*)::int from public.character_items) + (select count(*)::int from public.character_build_levels), 0, 'archived: no inventory nor level history');
select tests.set_identity('temp_password');
select is((select count(*)::int from public.character_items) + (select count(*)::int from public.character_build_levels), 0, 'temp_password: no inventory nor level history');

-- ---------------------------------------------------------------------------
-- The private part (3.6)
-- ---------------------------------------------------------------------------
select tests.set_identity('owner');
select is((select count(*)::int from public.character_private), 1, 'owner: reads exactly one private row');
select is((select backstory from public.character_private), 'SECRET c1', 'owner: their own backstory');
select is(tests.rows_affected($$update public.character_private set backstory = 'new', notes = 'mine' where character_id = 'c1000000-0000-4000-8000-000000000001'$$)::int, 1, 'owner: writes their private part');
select is(tests.rows_affected($$update public.character_private set backstory = 'pwn' where character_id = 'c2000000-0000-4000-8000-000000000002'$$)::int, 0, 'owner: cannot write another player''s private part');
select is((select count(*)::int from public.character_private where character_id = 'c2000000-0000-4000-8000-000000000002'), 0, 'owner: cannot read it either');
select is(tests.rows_affected($$delete from public.character_private where character_id = 'c1000000-0000-4000-8000-000000000001'$$)::int, 0, 'owner: cannot delete their private row');
select throws_ok($$insert into public.character_private (character_id) values ('c3000000-0000-4000-8000-000000000003')$$, '42501', null, 'owner: cannot insert a private row');

select tests.set_identity('other_player');
select is((select backstory from public.character_private), 'SECRET c2', 'other_player: sees only their own private row');
select is((select count(*)::int from public.character_private where character_id = 'c1000000-0000-4000-8000-000000000001'), 0, 'other_player: nothing of Alice''s secrets');

select tests.set_identity('non_member');
select is((select count(*)::int from public.character_private), 0, 'non_member: no private row');
select is(tests.rows_affected($$update public.character_private set backstory = 'pwn'$$)::int, 0, 'non_member: no private write');
select tests.set_identity('archived');
select is((select count(*)::int from public.character_private), 0, 'archived: no private row (even of their own disabled PC)');

select tests.set_identity('dm');
select is((select count(*)::int from public.character_private), 5, 'dm: reads every private row');

-- ---------------------------------------------------------------------------
-- Reassignment and removal by the DM (3.9)
-- ---------------------------------------------------------------------------
select is(
  tests.rows_affected(format($q$update public.characters set owner_user_id = %L where id = 'c1000000-0000-4000-8000-000000000001'$q$, tests.uid('other_player')))::int,
  1, 'dm: reassigns Alice''s character to Bob'
);
select tests.set_identity('owner');
select is(tests.rows_affected($$update public.characters set name = 'Still mine' where id = 'c1000000-0000-4000-8000-000000000001'$$)::int, 0, 'the former owner loses the write access at once');
select is((select count(*)::int from public.character_private where character_id = 'c1000000-0000-4000-8000-000000000001'), 0, 'the former owner no longer reads the private part');
select is(tests.rows_affected($$update public.character_items set quantity = 2 where character_id = 'c1000000-0000-4000-8000-000000000001'$$)::int, 0, 'nor writes the inventory');
select tests.set_identity('other_player');
select is(tests.rows_affected($$update public.characters set name = 'Bob now' where id = 'c1000000-0000-4000-8000-000000000001'$$)::int, 1, 'the new owner writes it at once');
select is((select backstory from public.character_private where character_id = 'c1000000-0000-4000-8000-000000000001'), 'new', 'and reads its private part');

select tests.set_identity('other_player');
select is(tests.rows_affected($$delete from public.characters where id = 'c1000000-0000-4000-8000-000000000001'$$)::int, 0, 'a player cannot delete a character, even their own');
select tests.set_identity('dm');
select is(tests.rows_affected($$delete from public.characters where id = 'c1000000-0000-4000-8000-000000000001'$$)::int, 1, 'dm: deletes a character');
select tests.reset_identity();
select is(
  (select count(*)::int from public.character_items where character_id = 'c1000000-0000-4000-8000-000000000001')
  + (select count(*)::int from public.character_build_levels where character_id = 'c1000000-0000-4000-8000-000000000001')
  + (select count(*)::int from public.character_private where character_id = 'c1000000-0000-4000-8000-000000000001'),
  0, 'the deletion removed the dependent rows'
);

select * from finish();
rollback;
