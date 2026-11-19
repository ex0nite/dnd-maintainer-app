-- Story 9.5: rule_entries.overrides_builtin. An entry that replaces a built-in rule (2024 code, 2014 SRD layer) can be
-- deleted while characters carry its id (the built-in rule takes its place again), and can receive review notes; other
-- entries naming it still block its deletion. Who may write the flag: the DM only (AD-14).
-- Every entry below is invented or names an SRD id (no book text).
begin;

select plan(19);

insert into auth.users (id, email)
select tests.uid(i), i || '@table.invalid'
from unnest(array['owner', 'non_member', 'dm']) as i;

insert into public.profiles (user_id, pseudo, role, must_change_password, archived_at)
values (tests.uid('dm'), 'maitre', 'dm', false, null),
       (tests.uid('owner'), 'alice', 'player', false, null),
       (tests.uid('non_member'), 'erin', 'player', false, null);

insert into public.campaigns (id, name, ruleset)
values ('bbbbbbbb-0000-4000-8000-00000000000b', 'Campaign 2014', '2014');
insert into public.campaign_members (campaign_id, user_id)
values ('bbbbbbbb-0000-4000-8000-00000000000b', tests.uid('owner'));

-- Structure -------------------------------------------------------------------------------------------------------------
select has_column('public', 'rule_entries', 'overrides_builtin', 'rule_entries has overrides_builtin');
select col_not_null('public', 'rule_entries', 'overrides_builtin', 'overrides_builtin is not null');
select col_default_is('public', 'rule_entries', 'overrides_builtin', 'false', 'overrides_builtin defaults to false');

-- Who may write the flag ----------------------------------------------------------------------------------------------
select tests.set_identity('dm');
select lives_ok(
  $$insert into public.rule_entries (ruleset, kind, id, content, overrides_builtin) values ('2014', 'species', 'dwarf',
    '{"schema":1,"kind":"species","id":"dwarf","name":{"en":"Table Dwarf"},"body":{"size":"medium","speed":25,"grants":[]}}', true)$$,
  'dm: inserts an override with the flag');
select lives_ok(
  $$insert into public.rule_entries (ruleset, kind, id, content) values ('2014', 'species', 'test-stoneborn',
    '{"schema":1,"kind":"species","id":"test-stoneborn","name":{"en":"Stoneborn"},"body":{"size":"medium","speed":30,"grants":[]}}')$$,
  'dm: inserts an entry without the flag (false)');
select lives_ok(
  $$insert into public.rule_entries (ruleset, kind, id, content, overrides_builtin) values ('2014', 'species', 'elf',
    '{"schema":1,"kind":"species","id":"elf","name":{"en":"Table Elf"},"body":{"size":"medium","speed":30,"grants":[]}}', true)$$,
  'dm: inserts a second override');
select lives_ok(
  $$insert into public.rule_entries (ruleset, kind, id, content) values ('2014', 'subspecies', 'test-grove-elf',
    '{"schema":1,"kind":"subspecies","id":"test-grove-elf","name":{"en":"Grove Elf"},"body":{"parent":"elf","grants":[]}}')$$,
  'dm: inserts an entry that names the elf override');
select is(tests.rows_affected($$update public.rule_entries set overrides_builtin = false where id = 'test-stoneborn'$$)::int, 1,
  'dm: updates the flag');
select tests.reset_identity();

select tests.set_identity('owner');
select is(tests.rows_affected($$update public.rule_entries set overrides_builtin = false where id = 'dwarf'$$)::int, 0,
  'player: can not change the flag (0 rows)');
select throws_ok(
  $$insert into public.rule_entries (ruleset, kind, id, content, overrides_builtin) values ('2014', 'feat', 'owner-feat',
    '{"schema":1,"kind":"feat","id":"owner-feat","name":{"en":"Owner Feat"},"body":{"category":"general","prerequisites":[],"grants":[]}}', true)$$,
  '42501', null, 'player: can not insert a flagged entry');
select is((select overrides_builtin from public.rule_entries where id = 'dwarf'), true, 'player: reads the flag');
select tests.reset_identity();

select tests.set_identity('non_member');
select is(tests.rows_affected($$update public.rule_entries set overrides_builtin = false$$)::int, 0,
  'non-member: can not change the flag (0 rows)');
select tests.reset_identity();

select tests.set_identity('anon');
select throws_ok($$update public.rule_entries set overrides_builtin = false$$, '42501', null, 'anon: can not change the flag');
select tests.reset_identity();

-- Characters carrying the ids --------------------------------------------------------------------------------------------
insert into public.characters (campaign_id, name, character_type, owner_user_id, species)
values ('bbbbbbbb-0000-4000-8000-00000000000b', 'Alice dwarf', 'pc', tests.uid('owner'), 'dwarf'),
       ('bbbbbbbb-0000-4000-8000-00000000000b', 'Alice elf', 'pc', tests.uid('owner'), 'elf'),
       ('bbbbbbbb-0000-4000-8000-00000000000b', 'Alice stoneborn', 'pc', tests.uid('owner'), 'test-stoneborn');

select tests.set_identity('dm');
select lives_ok(
  $$update public.rule_entries set content = jsonb_set(content, '{needsReview}', '["speed to confirm"]') where id = 'dwarf'$$,
  'an override in use can receive review notes (the built-in rule stays in force)');
select is(tests.rows_affected($$delete from public.rule_entries where ruleset = '2014' and kind = 'species' and id = 'dwarf'$$)::int,
  1, 'an override in use is deleted (the built-in rule takes its place again)');
select throws_ok($$delete from public.rule_entries where ruleset = '2014' and kind = 'species' and id = 'test-stoneborn'$$,
  '23503', null, 'an entry in use that overrides nothing can still not be deleted');
select throws_ok(
  $$update public.rule_entries set content = jsonb_set(content, '{needsReview}', '["to confirm"]') where id = 'test-stoneborn'$$,
  '23503', null, 'an entry in use that overrides nothing can still not receive review notes');
select throws_ok($$delete from public.rule_entries where ruleset = '2014' and kind = 'species' and id = 'elf'$$,
  '23503', null, 'an override named by another entry can not be deleted');
select tests.reset_identity();

select is((select count(*)::int from public.characters where species in ('dwarf', 'elf', 'test-stoneborn')), 3,
  'the characters are untouched');

select * from finish();
rollback;
