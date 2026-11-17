-- Epic 5 (FR20-FR22, D-14): published recaps (sessions.summary_published) and session_comments, 7 identities.
begin;

select plan(70);

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
       ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('temp_password'));

-- s1: published in A, s2: draft in A, s3: published in B (nobody of the players is in B)
insert into public.sessions (id, campaign_id, session_number, name, summary, summary_published)
values ('51111111-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', 1, 'Published', 'The party met.', true),
       ('51111111-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-00000000000a', 2, 'Draft', 'Secret draft', false),
       ('51111111-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-00000000000b', 1, 'Elsewhere', 'B recap', true);
update public.session_dm set notes = 'DM only notes', experience_awarded = 300 where session_id = '51111111-0000-4000-8000-000000000001';

insert into public.session_comments (id, campaign_id, session_id, author_id, body)
values ('61111111-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', '51111111-0000-4000-8000-000000000001', tests.uid('owner'), 'Great session'),
       ('61111111-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-00000000000a', '51111111-0000-4000-8000-000000000001', tests.uid('archived'), 'I was there too');

-- Structure -----------------------------------------------------------------------------------------------------------
select policies_are('public', 'sessions', array['sessions_dm_all', 'sessions_member_published', 'access_active'],
  'sessions: DM policy, published-for-members policy, active-user rule');
select policies_are('public', 'session_comments',
  array['session_comments_member_select', 'session_comments_member_insert', 'session_comments_author_update', 'session_comments_author_delete', 'session_comments_dm_all', 'access_active'],
  'session_comments: member, author, DM policies, active-user rule');
select throws_ok(
  $$insert into public.session_comments (campaign_id, session_id, author_id, body) values ('bbbbbbbb-0000-4000-8000-00000000000b', '51111111-0000-4000-8000-000000000001', tests.uid('dm'), 'mismatch')$$,
  '23503', null, 'a comment must carry the campaign of its session (foreign key)');

-- anon ----------------------------------------------------------------------------------------------------------------
select tests.set_identity('anon');
select throws_ok($$select * from public.session_comments$$, '42501', null, 'anon: comments refused');
select throws_ok($$select * from public.sessions$$, '42501', null, 'anon: sessions refused');
select tests.reset_identity();

-- owner (member of A) -----------------------------------------------------------------------------------------------------------
select tests.set_identity('owner');
select is((select count(*)::int from public.sessions), 1, 'owner: reads only the published session of their campaign');
select is((select name from public.sessions), 'Published', 'owner: it is the published one');
select is((select count(*)::int from public.sessions where id = '51111111-0000-4000-8000-000000000002'), 0, 'owner: the draft recap is not returned');
select is((select count(*)::int from public.session_dm), 0, 'owner: notes, loot and XP (session_dm) stay out of reach');
select is(tests.rows_affected($$update public.sessions set summary_published = true where id = '51111111-0000-4000-8000-000000000002'$$)::int, 0, 'owner: cannot publish');
select is(tests.rows_affected($$update public.sessions set summary = 'pwn'$$)::int, 0, 'owner: cannot edit a recap');
select is(tests.rows_affected($$delete from public.sessions$$)::int, 0, 'owner: cannot delete a session');
select throws_ok($$insert into public.sessions (campaign_id, session_number) values ('aaaaaaaa-0000-4000-8000-00000000000a', 9)$$, '42501', null, 'owner: cannot create a session');

select is((select count(*)::int from public.session_comments), 2, 'owner: reads the comments of the published recap, the archived author included');
select lives_ok(
  $$insert into public.session_comments (campaign_id, session_id, body) values ('aaaaaaaa-0000-4000-8000-00000000000a', '51111111-0000-4000-8000-000000000001', 'Nice')$$,
  'owner: comments a published recap');
select is((select author_id from public.session_comments where body = 'Nice'), tests.uid('owner'), 'owner: the author is the signed-in user');
select throws_ok(
  $$insert into public.session_comments (campaign_id, session_id, body) values ('aaaaaaaa-0000-4000-8000-00000000000a', '51111111-0000-4000-8000-000000000002', 'On a draft')$$,
  '42501', null, 'owner: commenting an unpublished recap is refused');
select throws_ok(
  $$insert into public.session_comments (campaign_id, session_id, body) values ('aaaaaaaa-0000-4000-8000-00000000000a', '51111111-0000-4000-8000-000000000003', 'Other campaign')$$,
  '42501', null, 'owner: commenting a session of another campaign is refused');
select throws_ok(
  $$insert into public.session_comments (campaign_id, session_id, body) values ('bbbbbbbb-0000-4000-8000-00000000000b', '51111111-0000-4000-8000-000000000003', 'In B')$$,
  '42501', null, 'owner: commenting in a campaign they are not in is refused');
select throws_ok(
  $$insert into public.session_comments (campaign_id, session_id, author_id, body) values ('aaaaaaaa-0000-4000-8000-00000000000a', '51111111-0000-4000-8000-000000000001', tests.uid('other_player'), 'Forged')$$,
  '42501', null, 'owner: a forged author is refused');
select throws_ok(
  $$insert into public.session_comments (campaign_id, session_id, body) values ('aaaaaaaa-0000-4000-8000-00000000000a', '51111111-0000-4000-8000-000000000001', '   ')$$,
  '23514', null, 'owner: a blank comment is refused');
select throws_ok(
  $$insert into public.session_comments (campaign_id, session_id, body) values ('aaaaaaaa-0000-4000-8000-00000000000a', '51111111-0000-4000-8000-000000000001', repeat('x', 2001))$$,
  '23514', null, 'owner: a comment over 2000 characters is refused');
select throws_ok(
  $$insert into public.session_comments (campaign_id, session_id, body, created_at) values ('aaaaaaaa-0000-4000-8000-00000000000a', '51111111-0000-4000-8000-000000000001', 'x', '2000-01-01')$$,
  '42501', null, 'owner: a forged created_at is refused');
select is(tests.rows_affected($$update public.session_comments set body = 'edited' where id = '61111111-0000-4000-8000-000000000001'$$)::int, 1, 'owner: edits their comment');
select is(tests.rows_affected($$update public.session_comments set body = 'pwn' where id = '61111111-0000-4000-8000-000000000002'$$)::int, 0, 'owner: edit of another comment touches 0 rows');
select is(tests.rows_affected($$delete from public.session_comments where id = '61111111-0000-4000-8000-000000000002'$$)::int, 0, 'owner: delete of another comment touches 0 rows');
select throws_ok(
  $$update public.session_comments set session_id = '51111111-0000-4000-8000-000000000002' where id = '61111111-0000-4000-8000-000000000001'$$,
  '42501', null, 'owner: moving a comment to another session is refused');
select throws_ok(
  $$update public.session_comments set author_id = tests.uid('other_player') where id = '61111111-0000-4000-8000-000000000001'$$,
  '42501', null, 'owner: re-attributing a comment is refused');
select is(tests.rows_affected($$delete from public.session_comments where id = '61111111-0000-4000-8000-000000000001'$$)::int, 1, 'owner: deletes their comment');
select tests.reset_identity();

-- other_player ----------------------------------------------------------------------------------------------------------------
select tests.set_identity('other_player');
select is((select count(*)::int from public.session_comments), 2, 'other_player: reads the comments of the table');
select is(tests.rows_affected($$update public.session_comments set body = 'pwn'$$)::int, 0, 'other_player: edits nobody else comment');
select tests.reset_identity();

-- archived, temp_password, non_member ---------------------------------------------------------------------------------------------
select tests.set_identity('archived');
select is((select count(*)::int from public.sessions), 0, 'archived: sessions invisible');
select is((select count(*)::int from public.session_comments), 0, 'archived: comments invisible');
select throws_ok($$insert into public.session_comments (campaign_id, session_id, body) values ('aaaaaaaa-0000-4000-8000-00000000000a', '51111111-0000-4000-8000-000000000001', 'x')$$, '42501', null, 'archived: comment refused');
select is(tests.rows_affected($$update public.session_comments set body = 'x' where id = '61111111-0000-4000-8000-000000000002'$$)::int, 0, 'archived: cannot edit their own earlier comment');
select tests.reset_identity();

select tests.set_identity('temp_password');
select is((select count(*)::int from public.sessions), 0, 'temp_password: sessions invisible');
select is((select count(*)::int from public.session_comments), 0, 'temp_password: comments invisible');
select throws_ok($$insert into public.session_comments (campaign_id, session_id, body) values ('aaaaaaaa-0000-4000-8000-00000000000a', '51111111-0000-4000-8000-000000000001', 'x')$$, '42501', null, 'temp_password: comment refused');
select tests.reset_identity();

select tests.set_identity('non_member');
select is((select count(*)::int from public.sessions), 0, 'non_member: sessions invisible');
select is((select count(*)::int from public.session_comments), 0, 'non_member: comments invisible');
select throws_ok($$insert into public.session_comments (campaign_id, session_id, body) values ('aaaaaaaa-0000-4000-8000-00000000000a', '51111111-0000-4000-8000-000000000001', 'x')$$, '42501', null, 'non_member: comment refused');
select is(tests.rows_affected($$update public.session_comments set body = 'x'$$)::int, 0, 'non_member: update touches 0 rows');
select is(tests.rows_affected($$delete from public.session_comments$$)::int, 0, 'non_member: delete touches 0 rows');
select tests.reset_identity();

-- dm --------------------------------------------------------------------------------------------------------------------------
select tests.set_identity('dm');
select is((select count(*)::int from public.sessions), 3, 'dm: reads every session');
select is((select count(*)::int from public.session_comments), 2, 'dm: reads every comment');
select is(tests.rows_affected($$update public.sessions set summary_published = true where id = '51111111-0000-4000-8000-000000000002'$$)::int, 1, 'dm: publishes a recap');
select lives_ok($$insert into public.session_comments (campaign_id, session_id, body) values ('aaaaaaaa-0000-4000-8000-00000000000a', '51111111-0000-4000-8000-000000000002', 'DM word')$$, 'dm: comments');
select is(tests.rows_affected($$update public.session_comments set body = 'moderated' where id = '61111111-0000-4000-8000-000000000002'$$)::int, 1, 'dm: edits a comment of a player');
select throws_ok(
  $$update public.session_comments set session_id = '51111111-0000-4000-8000-000000000002' where id = '61111111-0000-4000-8000-000000000002'$$,
  '42501', null, 'dm: cannot move a comment to another session either');
select is(tests.rows_affected($$delete from public.session_comments where id = '61111111-0000-4000-8000-000000000002'$$)::int, 1, 'dm: deletes a comment of a player');
select tests.reset_identity();

-- Unpublishing hides the recap and its comments from the members, nothing is deleted ----------------------------------------------
update public.sessions set summary_published = false where id = '51111111-0000-4000-8000-000000000001';
select tests.set_identity('owner');
select is((select count(*)::int from public.sessions where id = '51111111-0000-4000-8000-000000000001'), 0, 'unpublished: the member no longer reads the recap');
select is((select count(*)::int from public.session_comments where session_id = '51111111-0000-4000-8000-000000000001'), 0, 'unpublished: nor its comments');
select throws_ok($$insert into public.session_comments (campaign_id, session_id, body) values ('aaaaaaaa-0000-4000-8000-00000000000a', '51111111-0000-4000-8000-000000000001', 'late')$$, '42501', null, 'unpublished: no new comment');
select tests.reset_identity();
select is((select count(*)::int from public.session_comments where session_id = '51111111-0000-4000-8000-000000000001'), 1, 'unpublished: the comment is kept (seen here without any policy)');

-- Published again: the comments are back ---------------------------------------------------------------------------------------
update public.sessions set summary_published = true where id = '51111111-0000-4000-8000-000000000001';
select tests.set_identity('owner');
select is((select count(*)::int from public.session_comments where session_id = '51111111-0000-4000-8000-000000000001'), 1, 'republished: the comments are visible again');
select tests.reset_identity();

-- More cases: DM publication, former (non archived) member, own comment after unpublishing, previous slugs ------------------------------
select tests.set_identity('other_player');
select is(tests.rows_affected($$delete from public.session_comments where id = '61111111-0000-4000-8000-000000000002'$$)::int, 0, 'other_player: delete of another comment touches 0 rows');
select tests.reset_identity();
select tests.set_identity('owner');
select throws_ok(
  $$update public.session_comments set body = repeat('x', 2001) where body = 'Nice'$$,
  '23514', null, 'an edit to more than 2000 characters is refused');
select throws_ok(
  $$update public.session_comments set body = '  ' where body = 'Nice'$$,
  '23514', null, 'an edit to a blank text is refused');
select tests.reset_identity();
select tests.set_identity('anon');
select throws_ok($$insert into public.session_comments (campaign_id, session_id, body) values ('aaaaaaaa-0000-4000-8000-00000000000a', '51111111-0000-4000-8000-000000000001', 'x')$$, '42501', null, 'anon: comment insert refused');
select tests.reset_identity();

-- DM unpublishes through the API; the author then touches 0 rows on their own comment
select tests.set_identity('dm');
select is(tests.rows_affected($$update public.sessions set summary_published = false where id = '51111111-0000-4000-8000-000000000001'$$)::int, 1, 'dm: unpublishes through the API');
select tests.reset_identity();
select tests.set_identity('owner');
select is(tests.rows_affected($$update public.session_comments set body = 'late edit' where body = 'Nice'$$)::int, 0, 'author: cannot edit their comment of an unpublished recap');
select is(tests.rows_affected($$delete from public.session_comments where body = 'Nice'$$)::int, 0, 'author: cannot delete their comment of an unpublished recap');
select tests.reset_identity();
update public.sessions set summary_published = true where id = '51111111-0000-4000-8000-000000000001';

-- A former member who is NOT archived: reads nothing, writes nothing
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000f1', 'former@table.invalid');
insert into public.profiles (user_id, pseudo, role, must_change_password) values ('00000000-0000-4000-8000-0000000000f1', 'frank', 'player', false);
insert into public.session_comments (id, campaign_id, session_id, author_id, body)
values ('61111111-0000-4000-8000-0000000000f1', 'aaaaaaaa-0000-4000-8000-00000000000a', '51111111-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000f1', 'Before leaving');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.sessions), 0, 'former member: reads no session');
select is((select count(*)::int from public.session_comments), 0, 'former member: reads no comment');
select throws_ok($$insert into public.session_comments (campaign_id, session_id, body) values ('aaaaaaaa-0000-4000-8000-00000000000a', '51111111-0000-4000-8000-000000000001', 'x')$$, '42501', null, 'former member: cannot comment');
select is(tests.rows_affected($$update public.session_comments set body = 'x' where id = '61111111-0000-4000-8000-0000000000f1'$$)::int, 0, 'former member: cannot edit their old comment');
select is(tests.rows_affected($$delete from public.session_comments where id = '61111111-0000-4000-8000-0000000000f1'$$)::int, 0, 'former member: cannot delete their old comment');
select tests.reset_identity();

-- previous slugs are cleared when a recap gets published (the old titles were never published)
update public.sessions set summary_published = false, name = 'Old title' where id = '51111111-0000-4000-8000-000000000002';
update public.sessions set name = 'New title' where id = '51111111-0000-4000-8000-000000000002';
select ok(array_length(previous_slugs, 1) >= 1, 'a renamed draft keeps its previous slugs') from public.sessions where id = '51111111-0000-4000-8000-000000000002';
update public.sessions set name = 'Newer title', summary_published = true where id = '51111111-0000-4000-8000-000000000002';
select is((select previous_slugs from public.sessions where id = '51111111-0000-4000-8000-000000000002'), array[]::text[], 'publishing clears the previous slugs (even when renamed in the same statement)');

-- Names -------------------------------------------------------------------------------------------------------------------------
delete from public.campaign_members where campaign_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and user_id = tests.uid('archived');
insert into public.session_comments (campaign_id, session_id, author_id, body)
values ('aaaaaaaa-0000-4000-8000-00000000000a', '51111111-0000-4000-8000-000000000001', tests.uid('archived'), 'From a former member');
select tests.set_identity('other_player');
select ok(exists (select 1 from public.campaign_member_names('aaaaaaaa-0000-4000-8000-00000000000a') where user_id = tests.uid('archived')),
  'a former member who commented is still named');
select tests.reset_identity();

select * from finish();
rollback;
