-- Epic 4 (FR16-FR19, D-10..D-12): notes_personal and notes_shared, 7 identities.
begin;

select plan(84);

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
       ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('other_player')),
       ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('archived')),
       ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('temp_password')),
       ('bbbbbbbb-0000-4000-8000-00000000000b', tests.uid('other_player'));

insert into public.notes_personal (id, campaign_id, author_id, title, body)
values ('11111111-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('owner'), 'Alice clue', 'secret'),
       ('11111111-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('other_player'), 'Bob clue', 'secret too'),
       ('11111111-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-00000000000b', tests.uid('other_player'), 'Bob in B', 'b');
insert into public.notes_shared (id, campaign_id, author_id, title, pinned)
values ('22222222-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('owner'), 'Alice shared', false),
       ('22222222-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('other_player'), 'Bob shared', true),
       ('22222222-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-00000000000b', tests.uid('other_player'), 'Shared in B', false);

-- Structure -----------------------------------------------------------------------------------------------------------
select policies_are('public', 'notes_personal', array['notes_personal_author_all', 'notes_personal_dm_select', 'access_active'],
  'notes_personal: author policy, DM read policy, active-user rule');
select policies_are('public', 'notes_shared',
  array['notes_shared_member_select', 'notes_shared_member_insert', 'notes_shared_author_update', 'notes_shared_author_delete', 'notes_shared_dm_all', 'access_active'],
  'notes_shared: member, author, DM policies, active-user rule');
select ok(
  not has_table_privilege('anon', 'public.notes_personal', 'SELECT') and not has_table_privilege('anon', 'public.notes_shared', 'SELECT'),
  'anon holds no privilege on the note tables'
);

-- anon ----------------------------------------------------------------------------------------------------------------
select tests.set_identity('anon');
select throws_ok($$select * from public.notes_personal$$, '42501', null, 'anon: personal notes refused');
select throws_ok($$select * from public.notes_shared$$, '42501', null, 'anon: shared notes refused');
select throws_ok($$insert into public.notes_shared (campaign_id, title) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'x')$$, '42501', null, 'anon: shared insert refused');
select tests.reset_identity();

-- owner (member of A only) ----------------------------------------------------------------------------------------------
select tests.set_identity('owner');
select is((select count(*)::int from public.notes_personal), 1, 'owner: sees only their own personal note');
select is((select count(*)::int from public.notes_personal where author_id <> tests.uid('owner')), 0, 'owner: no personal note of another player');
select lives_ok(
  $$insert into public.notes_personal (campaign_id, title, body) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'New', 'text')$$,
  'owner: creates a personal note (author defaults to auth.uid())');
select is((select author_id from public.notes_personal where title = 'New'), tests.uid('owner'), 'owner: the author is the signed-in user');
select throws_ok(
  $$insert into public.notes_personal (campaign_id, author_id, title) values ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('other_player'), 'Forged')$$,
  '42501', null, 'owner: a forged author is refused');
select throws_ok(
  $$insert into public.notes_personal (campaign_id, title) values ('bbbbbbbb-0000-4000-8000-00000000000b', 'Not my campaign')$$,
  '42501', null, 'owner: a note in a campaign they are not in is refused');
select throws_ok(
  $$insert into public.notes_personal (campaign_id, body) values ('aaaaaaaa-0000-4000-8000-00000000000a', repeat('x', 10001))$$,
  '23514', null, 'owner: a body over 10000 characters is refused by CHECK');
select lives_ok(
  $$insert into public.notes_personal (campaign_id, body) values ('aaaaaaaa-0000-4000-8000-00000000000a', repeat('x', 10000))$$,
  'owner: a body of exactly 10000 characters is accepted');
select is(tests.rows_affected($$update public.notes_personal set body = 'edited' where id = '11111111-0000-4000-8000-000000000001'$$)::int, 1, 'owner: edits their note');
select is(tests.rows_affected($$update public.notes_personal set body = 'pwn' where id = '11111111-0000-4000-8000-000000000002'$$)::int, 0, 'owner: edit of another player note touches 0 rows');
select is(tests.rows_affected($$delete from public.notes_personal where id = '11111111-0000-4000-8000-000000000002'$$)::int, 0, 'owner: delete of another player note touches 0 rows');
select throws_ok(
  $$update public.notes_personal set campaign_id = 'bbbbbbbb-0000-4000-8000-00000000000b' where id = '11111111-0000-4000-8000-000000000001'$$,
  '42501', null, 'owner: moving a note to another campaign is refused');
select throws_ok(
  $$update public.notes_personal set author_id = tests.uid('other_player') where id = '11111111-0000-4000-8000-000000000001'$$,
  '42501', null, 'owner: re-attributing a note is refused');
select is(tests.rows_affected($$delete from public.notes_personal where id = '11111111-0000-4000-8000-000000000001'$$)::int, 1, 'owner: deletes their note');

select is((select count(*)::int from public.notes_shared), 2, 'owner: reads the shared notes of A, not those of B');
select is((select title from public.notes_shared order by pinned desc, title limit 1), 'Bob shared', 'owner: the pinned shared note sorts first');
select lives_ok(
  $$insert into public.notes_shared (campaign_id, title, category, pinned, body) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Owner shared', 'quest', true, 'b')$$,
  'owner: creates a shared note');
select throws_ok(
  $$insert into public.notes_shared (campaign_id, author_id, title) values ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('other_player'), 'Forged')$$,
  '42501', null, 'owner: a shared note in another name is refused');
select throws_ok(
  $$insert into public.notes_shared (campaign_id, title) values ('bbbbbbbb-0000-4000-8000-00000000000b', 'Elsewhere')$$,
  '42501', null, 'owner: a shared note in a campaign they are not in is refused');
select throws_ok(
  $$insert into public.notes_shared (campaign_id, title, category) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Bad', 'secret')$$,
  '23514', null, 'owner: an unknown category is refused');
select is(tests.rows_affected($$update public.notes_shared set pinned = true, body = 'e' where id = '22222222-0000-4000-8000-000000000001'$$)::int, 1, 'owner: edits and pins their shared note');
select is(tests.rows_affected($$update public.notes_shared set title = 'pwn' where id = '22222222-0000-4000-8000-000000000002'$$)::int, 0, 'owner: edit of another shared note touches 0 rows');
select is(tests.rows_affected($$delete from public.notes_shared where id = '22222222-0000-4000-8000-000000000002'$$)::int, 0, 'owner: delete of another shared note touches 0 rows');
select throws_ok(
  $$update public.notes_shared set author_id = tests.uid('other_player') where id = '22222222-0000-4000-8000-000000000001'$$,
  '42501', null, 'owner: re-attributing a shared note is refused');
select is(tests.rows_affected($$delete from public.notes_shared where id = '22222222-0000-4000-8000-000000000001'$$)::int, 1, 'owner: deletes their shared note');
select tests.reset_identity();

-- other_player (member of A and B) -----------------------------------------------------------------------------------------
select tests.set_identity('other_player');
select is((select count(*)::int from public.notes_personal), 2, 'other_player: one notebook per campaign (A and B)');
select throws_ok(
  $$update public.notes_personal set campaign_id = 'bbbbbbbb-0000-4000-8000-00000000000b' where id = '11111111-0000-4000-8000-000000000002'$$,
  '42501', null, 'other_player: moving a note between two campaigns they are in is refused too');
select is((select count(*)::int from public.notes_shared), 3, 'other_player: reads the shared notes of both campaigns');
select tests.reset_identity();

-- archived, temp_password, non_member ---------------------------------------------------------------------------------------
insert into public.notes_personal (campaign_id, author_id, title) values ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('archived'), 'Before archive');

select tests.set_identity('archived');
select is((select count(*)::int from public.notes_personal), 0, 'archived: personal notes invisible');
select is((select count(*)::int from public.notes_shared), 0, 'archived: shared notes invisible');
select throws_ok($$insert into public.notes_shared (campaign_id, title) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'x')$$, '42501', null, 'archived: shared insert refused');
select throws_ok($$insert into public.notes_personal (campaign_id, title) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'x')$$, '42501', null, 'archived: personal insert refused');
select tests.reset_identity();

select tests.set_identity('temp_password');
select is((select count(*)::int from public.notes_personal), 0, 'temp_password: personal notes invisible');
select is((select count(*)::int from public.notes_shared), 0, 'temp_password: shared notes invisible');
select throws_ok($$insert into public.notes_shared (campaign_id, title) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'x')$$, '42501', null, 'temp_password: shared insert refused');
select tests.reset_identity();

select tests.set_identity('non_member');
select is((select count(*)::int from public.notes_personal), 0, 'non_member: personal notes invisible');
select is((select count(*)::int from public.notes_shared), 0, 'non_member: shared notes invisible');
select throws_ok($$insert into public.notes_shared (campaign_id, title) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'x')$$, '42501', null, 'non_member: shared insert refused');
select throws_ok($$insert into public.notes_personal (campaign_id, title) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'x')$$, '42501', null, 'non_member: personal insert refused');
select is(tests.rows_affected($$update public.notes_shared set title = 'pwn'$$)::int, 0, 'non_member: shared update touches 0 rows');
select is(tests.rows_affected($$delete from public.notes_shared$$)::int, 0, 'non_member: shared delete touches 0 rows');
select tests.reset_identity();

-- dm ------------------------------------------------------------------------------------------------------------------------
select tests.set_identity('dm');
select is((select count(*)::int from public.notes_personal), 5, 'dm: reads every personal note (with its author)');
select is((select count(distinct author_id)::int from public.notes_personal), 3, 'dm: sees the author of each note');
select is(tests.rows_affected($$update public.notes_personal set body = 'dm edit'$$)::int, 0, 'dm: cannot edit a personal note (0 rows)');
select is(tests.rows_affected($$delete from public.notes_personal$$)::int, 0, 'dm: cannot delete a personal note (0 rows)');
select throws_ok(
  $$insert into public.notes_personal (campaign_id, title) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'dm note')$$,
  '42501', null, 'dm: cannot write in a player notebook');
select is((select count(*)::int from public.notes_shared), 3, 'dm: reads every shared note');
select lives_ok($$insert into public.notes_shared (campaign_id, title) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'DM shared')$$, 'dm: creates a shared note');
select is(tests.rows_affected($$update public.notes_shared set pinned = true where id = '22222222-0000-4000-8000-000000000002'$$)::int, 1, 'dm: moderates another author note');
select is(tests.rows_affected($$delete from public.notes_shared where id = '22222222-0000-4000-8000-000000000002'$$)::int, 1, 'dm: deletes another author note');
select tests.reset_identity();

-- Names of the authors ------------------------------------------------------------------------------------------------------
select tests.set_identity('owner');
select is((select count(*)::int from public.campaign_member_names('aaaaaaaa-0000-4000-8000-00000000000a')), 5,
  'owner: gets the pseudos of the 4 members of A and of the DM');
select is((select count(*)::int from public.campaign_member_names('bbbbbbbb-0000-4000-8000-00000000000b')), 0,
  'owner: gets nothing for a campaign they are not in');
select tests.reset_identity();
select tests.set_identity('archived');
select is((select count(*)::int from public.campaign_member_names('aaaaaaaa-0000-4000-8000-00000000000a')), 0, 'archived: gets nothing');
select tests.reset_identity();
select tests.set_identity('non_member');
select is((select count(*)::int from public.campaign_member_names('aaaaaaaa-0000-4000-8000-00000000000a')), 0, 'non_member: gets nothing');
select tests.reset_identity();
select tests.set_identity('dm');
select is((select count(*)::int from public.campaign_member_names('bbbbbbbb-0000-4000-8000-00000000000b')), 2, 'dm: gets the members of any campaign');
select tests.reset_identity();
select tests.set_identity('anon');
select throws_ok($$select * from public.campaign_member_names('aaaaaaaa-0000-4000-8000-00000000000a')$$, '42501', null, 'anon: cannot call it');
select tests.reset_identity();

-- Column privileges: ids, timestamps and campaign cannot be set through the API ------------------------------------------------
select tests.set_identity('other_player');
select throws_ok(
  $$insert into public.notes_shared (campaign_id, title, updated_at) values ('bbbbbbbb-0000-4000-8000-00000000000b', 'Forged date', '2999-01-01')$$,
  '42501', null, 'a player cannot set updated_at at insert');
select throws_ok(
  $$insert into public.notes_shared (id, campaign_id, title) values (gen_random_uuid(), 'bbbbbbbb-0000-4000-8000-00000000000b', 'Forged id')$$,
  '42501', null, 'a player cannot choose the id');
select throws_ok(
  $$insert into public.notes_shared (campaign_id, author_id, title) values ('bbbbbbbb-0000-4000-8000-00000000000b', null, 'No author')$$,
  '42501', null, 'a player cannot state author_id, not even null');
select throws_ok(
  $$update public.notes_shared set campaign_id = 'aaaaaaaa-0000-4000-8000-00000000000a' where id = '22222222-0000-4000-8000-000000000003'$$,
  '42501', null, 'shared: moving a note to another campaign is refused');
select throws_ok(
  $$update public.notes_shared set created_at = '2000-01-01' where id = '22222222-0000-4000-8000-000000000003'$$,
  '42501', null, 'shared: created_at is not editable');
select throws_ok(
  $$insert into public.notes_shared (campaign_id, title) values ('bbbbbbbb-0000-4000-8000-00000000000b', '   ')$$,
  '23514', null, 'shared: a blank title is refused');
select throws_ok(
  $$insert into public.notes_shared (campaign_id, title) values ('bbbbbbbb-0000-4000-8000-00000000000b', repeat('t', 201))$$,
  '23514', null, 'shared: a title over 200 characters is refused');
select throws_ok(
  $$insert into public.notes_personal (campaign_id, title) values ('bbbbbbbb-0000-4000-8000-00000000000b', repeat('t', 201))$$,
  '23514', null, 'personal: a title over 200 characters is refused');
select tests.reset_identity();
select tests.set_identity('dm');
select throws_ok(
  $$insert into public.notes_shared (campaign_id, author_id, title) values ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('owner'), 'In their name')$$,
  '42501', null, 'dm: cannot write a shared note in a player name');
select throws_ok(
  $$update public.notes_shared set campaign_id = 'aaaaaaaa-0000-4000-8000-00000000000a' where id = '22222222-0000-4000-8000-000000000003'$$,
  '42501', null, 'dm: cannot move a shared note to another campaign');
select tests.reset_identity();

-- Archived / temp-password authors: their existing notes can no longer be changed ------------------------------------------------
insert into public.notes_shared (id, campaign_id, author_id, title)
values ('22222222-0000-4000-8000-000000000009', 'aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('archived'), 'Archived author note');
select tests.set_identity('archived');
select is(tests.rows_affected($$update public.notes_shared set title = 'x' where id = '22222222-0000-4000-8000-000000000009'$$)::int, 0, 'archived: cannot edit their own shared note');
select is(tests.rows_affected($$delete from public.notes_shared where id = '22222222-0000-4000-8000-000000000009'$$)::int, 0, 'archived: cannot delete their own shared note');
select tests.reset_identity();
select tests.set_identity('temp_password');
select throws_ok($$insert into public.notes_personal (campaign_id, title) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'x')$$, '42501', null, 'temp_password: personal insert refused');
select tests.reset_identity();
select tests.set_identity('non_member');
select is(tests.rows_affected($$update public.notes_personal set title = 'x'$$)::int, 0, 'non_member: personal update touches 0 rows');
select is(tests.rows_affected($$delete from public.notes_personal$$)::int, 0, 'non_member: personal delete touches 0 rows');
select tests.reset_identity();
select ok(
  (select prosecdef and proconfig = array['search_path=""'] from pg_proc where proname = 'campaign_member_names' and pronamespace = 'public'::regnamespace),
  'campaign_member_names is SECURITY DEFINER with an empty search_path');

-- A player who leaves the campaign: the DM keeps reading their notes, they lose the access -------------------------------------
delete from public.campaign_members where campaign_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and user_id = tests.uid('other_player');
select tests.set_identity('other_player');
select is((select count(*)::int from public.notes_personal), 1, 'removed player: only the notebook of the campaign they are still in');
select is(tests.rows_affected($$update public.notes_personal set title = 'x' where id = '11111111-0000-4000-8000-000000000002'$$)::int, 0, 'removed player: cannot edit their note of A any more');
select is(tests.rows_affected($$update public.notes_shared set title = 'x' where id = '22222222-0000-4000-8000-000000000003'$$)::int, 1, 'removed player: still member of B, edits their note there');
select is((select count(*)::int from public.notes_shared where campaign_id = 'aaaaaaaa-0000-4000-8000-00000000000a'), 0, 'removed player: reads no shared note of A');
select tests.reset_identity();
select tests.set_identity('dm');
select ok(exists (select 1 from public.notes_personal where id = '11111111-0000-4000-8000-000000000002'), 'dm: still reads the notes of a removed player');
select ok(exists (select 1 from public.campaign_member_names('aaaaaaaa-0000-4000-8000-00000000000a') where user_id = tests.uid('other_player')),
  'dm: still gets the pseudo of a removed player who wrote notes');
select tests.reset_identity();

select * from finish();
rollback;
