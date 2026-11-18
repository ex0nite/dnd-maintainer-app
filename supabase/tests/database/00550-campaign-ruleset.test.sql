-- Story 9.1: campaigns.ruleset, 7 identities (AD-14) for the operations that matter: read, insert, update.
begin;

select plan(20);

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
values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Campaign A'), ('bbbbbbbb-0000-4000-8000-00000000000b', 'Campaign B');
insert into public.campaign_members (campaign_id, user_id)
values ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('owner')),
       ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('archived')),
       ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('temp_password'));

-- Structure -----------------------------------------------------------------------------------------------------------
select is((select ruleset from public.campaigns where name = 'Campaign A'), '2024', 'a campaign defaults to the 2024 rules');
select throws_ok(
  $$insert into public.campaigns (name, ruleset) values ('Bad', '2020')$$,
  '23514', null, 'an unknown edition is refused');
select ok(
  not has_function_privilege('authenticated', 'public.campaigns_lock_ruleset()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.campaigns_lock_ruleset()', 'EXECUTE'),
  'the trigger function is callable by no API role');

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
  $$insert into public.characters (id, campaign_id, name, character_type)
    values ('c1000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Draft PC', 'pc')$$,
  'dm: creates a draft character');
select lives_ok(
  $$update public.campaigns set ruleset = '2024' where id = 'aaaaaaaa-0000-4000-8000-00000000000a'$$,
  'dm: switches back while the only character is a draft');
select lives_ok(
  $$update public.characters set status = 'ready' where id = 'c1000000-0000-4000-8000-000000000001'$$,
  'dm: finalizes the character');
select throws_ok(
  $$update public.campaigns set ruleset = '2014' where id = 'aaaaaaaa-0000-4000-8000-00000000000a'$$,
  '23514', null, 'dm: cannot switch once a character is finalized');
select is((select ruleset from public.campaigns where id = 'aaaaaaaa-0000-4000-8000-00000000000a'), '2024', 'dm: the edition is unchanged after the refusal');
select lives_ok(
  $$update public.campaigns set ruleset = '2024', name = 'Campaign A bis' where id = 'aaaaaaaa-0000-4000-8000-00000000000a'$$,
  'dm: writing the same edition (and other fields) is still fine');
select lives_ok(
  $$update public.campaigns set ruleset = '2014' where id = 'bbbbbbbb-0000-4000-8000-00000000000b'$$,
  'dm: another campaign without characters is not affected by the lock');
select tests.reset_identity();

-- owner (member): reads the edition, cannot change it -----------------------------------------------------------------
select tests.set_identity('owner');
select is((select ruleset from public.campaigns where id = 'aaaaaaaa-0000-4000-8000-00000000000a'), '2024', 'owner: reads the edition of their campaign');
select lives_ok(
  $$update public.campaigns set ruleset = '2014' where id = 'aaaaaaaa-0000-4000-8000-00000000000a'$$,
  'owner: the update is accepted but touches no row (no update policy for players)');
select is((select ruleset from public.campaigns where id = 'aaaaaaaa-0000-4000-8000-00000000000a'), '2024', 'owner: the edition is unchanged');
select tests.reset_identity();

-- non_member, archived, temp_password -----------------------------------------------------------------------------------
select tests.set_identity('non_member');
select is((select count(*)::int from public.campaigns), 0, 'non_member: sees no campaign, so no edition');
select tests.reset_identity();

select tests.set_identity('archived');
select is((select count(*)::int from public.campaigns), 0, 'archived: sees no campaign');
select tests.reset_identity();

select tests.set_identity('temp_password');
select is((select count(*)::int from public.campaigns), 0, 'temp_password: sees no campaign');
select tests.reset_identity();

select * from finish();
rollback;
