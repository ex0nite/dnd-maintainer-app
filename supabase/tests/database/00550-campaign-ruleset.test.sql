-- Story 9.1: campaigns.ruleset and the two triggers around it, 7 identities (AD-14).
--   campaigns_lock_ruleset:   the edition can not change once a character is finalized.
--   characters_check_ruleset: a character can not be finalized (or moved) against the rules of its campaign.
begin;

select plan(55);

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

-- A and C stay on 2024 unless a test says otherwise; B is switched to 2014 by the dm below.
insert into public.campaigns (id, name)
values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Campaign A'),
       ('bbbbbbbb-0000-4000-8000-00000000000b', 'Campaign B'),
       ('cccccccc-0000-4000-8000-00000000000c', 'Campaign C');
insert into public.campaign_members (campaign_id, user_id)
values ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('owner')),
       ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('archived')),
       ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('temp_password')),
       ('bbbbbbbb-0000-4000-8000-00000000000b', tests.uid('other_player'));
-- A draft owned by other_player in B (B is later switched to 2014).
insert into public.characters (id, campaign_id, name, character_type, owner_user_id)
values ('c3000000-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-00000000000b', 'Bob draft', 'pc', tests.uid('other_player'));

-- Structure -----------------------------------------------------------------------------------------------------------
select is((select ruleset from public.campaigns where name = 'Campaign A'), '2024', 'a campaign defaults to the 2024 rules');
select throws_ok(
  $$insert into public.campaigns (name, ruleset) values ('Bad', '2020')$$,
  '23514', null, 'an unknown edition is refused');
select ok(
  not has_function_privilege('authenticated', 'public.campaigns_lock_ruleset()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.campaigns_lock_ruleset()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.characters_check_ruleset()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.characters_check_ruleset()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.ruleset_has_engine(text)', 'EXECUTE'),
  'the trigger functions are callable by no API role');
select ok(public.ruleset_has_engine('2024') and not public.ruleset_has_engine('2014'), 'only the 2024 edition has a sheet engine today');

-- anon ----------------------------------------------------------------------------------------------------------------
select tests.set_identity('anon');
select throws_ok($$select ruleset from public.campaigns$$, '42501', null, 'anon: cannot read the edition');
select throws_ok($$update public.campaigns set ruleset = '2014'$$, '42501', null, 'anon: cannot change the edition');
select tests.reset_identity();

-- dm: free to switch while no character is finalized -------------------------------------------------------------------
select tests.set_identity('dm');
select lives_ok(
  $$update public.campaigns set ruleset = '2014' where id = 'aaaaaaaa-0000-4000-8000-00000000000a'$$,
  'dm: switches an empty campaign to 2014');
select is((select ruleset from public.campaigns where id = 'aaaaaaaa-0000-4000-8000-00000000000a'), '2014', 'dm: the edition is now 2014');
select lives_ok(
  $$update public.campaigns set ruleset = '2024' where id = 'aaaaaaaa-0000-4000-8000-00000000000a'$$,
  'dm: switches back to 2024');
select lives_ok(
  $$insert into public.characters (id, campaign_id, name, character_type)
    values ('c1000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Draft PC', 'pc')$$,
  'dm: creates a draft character');
select lives_ok(
  $$update public.campaigns set ruleset = '2014' where id = 'aaaaaaaa-0000-4000-8000-00000000000a'$$,
  'dm: switches while the only character is a draft');
select lives_ok(
  $$update public.campaigns set ruleset = '2024' where id = 'aaaaaaaa-0000-4000-8000-00000000000a'$$,
  'dm: switches back (drafts do not lock)');
select lives_ok(
  $$update public.characters set status = 'ready' where id = 'c1000000-0000-4000-8000-000000000001'$$,
  'dm: finalizes the character in a 2024 campaign');
select throws_ok(
  $$update public.campaigns set ruleset = '2014' where id = 'aaaaaaaa-0000-4000-8000-00000000000a'$$,
  '23514', null, 'dm: cannot switch once a character is finalized');
select is((select ruleset from public.campaigns where id = 'aaaaaaaa-0000-4000-8000-00000000000a'), '2024', 'dm: the edition is unchanged after the refusal');
select lives_ok(
  $$update public.campaigns set ruleset = '2024', name = 'Campaign A bis' where id = 'aaaaaaaa-0000-4000-8000-00000000000a'$$,
  'dm: writing the same edition (and other fields) is still fine');
select lives_ok(
  $$update public.campaigns set ruleset = '2014' where id = 'bbbbbbbb-0000-4000-8000-00000000000b'$$,
  'dm: another campaign with only a draft is not affected by the lock');
select throws_ok(
  $$update public.campaigns set ruleset = '2014'$$,
  '23514', null, 'dm: an update of every campaign fails as a whole when one of them is locked');
select tests.reset_identity();

-- what the locked campaign refused must not have leaked into the others
select is((select ruleset from public.campaigns where id = 'aaaaaaaa-0000-4000-8000-00000000000a'), '2024', 'A is still 2024 after the failed bulk update');
select is((select ruleset from public.campaigns where id = 'bbbbbbbb-0000-4000-8000-00000000000b'), '2014', 'B is 2014');
select is((select ruleset from public.campaigns where id = 'cccccccc-0000-4000-8000-00000000000c'), '2024', 'C is still 2024 after the failed bulk update');

-- Players, archived, temp_password, non_member: never change the edition ----------------------------------------------------
select tests.set_identity('owner');
select is((select ruleset from public.campaigns where id = 'aaaaaaaa-0000-4000-8000-00000000000a'), '2024', 'owner: reads the edition of their campaign');
select lives_ok(
  $$update public.campaigns set ruleset = '2014' where id = 'aaaaaaaa-0000-4000-8000-00000000000a'$$,
  'owner: the update is accepted but touches no row (no update policy for players)');
select throws_ok(
  $$insert into public.campaigns (name, ruleset) values ('Player campaign', '2014')$$,
  '42501', null, 'owner: cannot create a campaign');
select tests.reset_identity();

select tests.set_identity('other_player');
select is((select ruleset from public.campaigns where id = 'bbbbbbbb-0000-4000-8000-00000000000b'), '2014', 'other_player: reads the edition of B');
select is((select count(*)::int from public.campaigns where id = 'aaaaaaaa-0000-4000-8000-00000000000a'), 0, 'other_player: sees nothing of A');
select lives_ok(
  $$update public.campaigns set ruleset = '2024' where id = 'bbbbbbbb-0000-4000-8000-00000000000b'$$,
  'other_player: the update of B touches no row');
select tests.reset_identity();

select tests.set_identity('archived');
select is((select count(*)::int from public.campaigns), 0, 'archived: sees no campaign');
select lives_ok($$update public.campaigns set ruleset = '2014'$$, 'archived: an update touches no row');
select tests.reset_identity();

select tests.set_identity('temp_password');
select is((select count(*)::int from public.campaigns), 0, 'temp_password: sees no campaign');
select lives_ok($$update public.campaigns set ruleset = '2014'$$, 'temp_password: an update touches no row');
select tests.reset_identity();

select tests.set_identity('non_member');
select is((select count(*)::int from public.campaigns), 0, 'non_member: sees no campaign');
select lives_ok($$update public.campaigns set ruleset = '2014'$$, 'non_member: an update touches no row');
select tests.reset_identity();

select is((select ruleset from public.campaigns where id = 'aaaaaaaa-0000-4000-8000-00000000000a'), '2024', 'A is untouched by every player identity');
select is((select ruleset from public.campaigns where id = 'bbbbbbbb-0000-4000-8000-00000000000b'), '2014', 'B is untouched by every player identity');

-- What locks and what does not (campaign C) ----------------------------------------------------------------------------------
select tests.set_identity('dm');
select lives_ok(
  $$insert into public.characters (id, campaign_id, name, character_type, status)
    values ('c4000000-0000-4000-8000-000000000004', 'cccccccc-0000-4000-8000-00000000000c', 'Finalized NPC', 'npc', 'ready')$$,
  'dm: a finalized NPC is created in C');
select throws_ok(
  $$update public.campaigns set ruleset = '2014' where id = 'cccccccc-0000-4000-8000-00000000000c'$$,
  '23514', null, 'a finalized NPC locks the edition too');
select lives_ok(
  $$update public.characters set is_active = false where id = 'c4000000-0000-4000-8000-000000000004'$$,
  'dm: deactivates the finalized NPC');
select throws_ok(
  $$update public.campaigns set ruleset = '2014' where id = 'cccccccc-0000-4000-8000-00000000000c'$$,
  '23514', null, 'a deactivated finalized character still locks the edition');
select lives_ok(
  $$delete from public.characters where id = 'c4000000-0000-4000-8000-000000000004'$$,
  'dm: deletes the only finalized character');
select lives_ok(
  $$update public.campaigns set ruleset = '2014' where id = 'cccccccc-0000-4000-8000-00000000000c'$$,
  'the edition is free again once no finalized character is left');
select lives_ok(
  $$update public.campaigns set ruleset = '2024' where id = 'cccccccc-0000-4000-8000-00000000000c'$$,
  'dm: C goes back to 2024');
select lives_ok(
  $$insert into public.characters (id, campaign_id, name, character_type)
    values ('c5000000-0000-4000-8000-000000000005', 'cccccccc-0000-4000-8000-00000000000c', 'Back to draft', 'pc')$$,
  'dm: a draft is created in C');
select lives_ok(
  $$update public.characters set status = 'ready' where id = 'c5000000-0000-4000-8000-000000000005'$$,
  'dm: it is finalized');
select throws_ok(
  $$update public.campaigns set ruleset = '2014' where id = 'cccccccc-0000-4000-8000-00000000000c'$$,
  '23514', null, 'the edition is locked while it is finalized');
select lives_ok(
  $$update public.characters set status = 'draft' where id = 'c5000000-0000-4000-8000-000000000005'$$,
  'dm: puts it back to draft (by design: nothing is finalized any more)');
select lives_ok(
  $$update public.campaigns set ruleset = '2014' where id = 'cccccccc-0000-4000-8000-00000000000c'$$,
  'the edition is free again');
select lives_ok(
  $$update public.campaigns set ruleset = '2024' where id = 'cccccccc-0000-4000-8000-00000000000c'$$,
  'dm: C is back to 2024 for the next tests');
select tests.reset_identity();

-- Finalizing, or moving, against the rules of the campaign (B is 2014: no sheet engine) -------------------------------------
select tests.set_identity('dm');
select lives_ok(
  $$insert into public.characters (id, campaign_id, name, character_type)
    values ('c6000000-0000-4000-8000-000000000006', 'bbbbbbbb-0000-4000-8000-00000000000b', 'Draft in 2014', 'pc')$$,
  'dm: a draft is allowed in a 2014 campaign');
select throws_ok(
  $$update public.characters set status = 'ready' where id = 'c6000000-0000-4000-8000-000000000006'$$,
  '23514', null, 'dm: cannot finalize a character in a 2014 campaign');
select throws_ok(
  $$insert into public.characters (campaign_id, name, character_type, status)
    values ('bbbbbbbb-0000-4000-8000-00000000000b', 'Ready at once', 'pc', 'ready')$$,
  '23514', null, 'dm: cannot insert a finalized character in a 2014 campaign');
select throws_ok(
  $$update public.characters set campaign_id = 'bbbbbbbb-0000-4000-8000-00000000000b' where id = 'c1000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'dm: cannot move a finalized character from a 2024 to a 2014 campaign');
select lives_ok(
  $$update public.characters set campaign_id = 'cccccccc-0000-4000-8000-00000000000c' where id = 'c1000000-0000-4000-8000-000000000001'$$,
  'dm: can move a finalized character between two 2024 campaigns');
select tests.reset_identity();

select tests.set_identity('other_player');
select throws_ok(
  $$update public.characters set status = 'ready' where id = 'c3000000-0000-4000-8000-000000000003'$$,
  '23514', null, 'other_player: a direct write cannot finalize their own draft in a 2014 campaign');
select lives_ok(
  $$update public.characters set name = 'Bob renamed' where id = 'c3000000-0000-4000-8000-000000000003'$$,
  'other_player: other edits of their draft still work');
select tests.reset_identity();

select * from finish();
rollback;
