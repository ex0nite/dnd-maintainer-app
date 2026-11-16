-- Story 1.4 (AD-3, AD-4, AD-14): helpers, campaigns, campaign_members, campaign_dm,
-- for the seven identities.
begin;

select plan(100);

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

insert into public.campaigns (id, name, description)
values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Campaign A', 'a'),
       ('bbbbbbbb-0000-4000-8000-00000000000b', 'Campaign B', 'b');

-- The trigger created the private rows; put a secret in A's.
update public.campaign_dm set dm_notes = 'SECRET A' where campaign_id = 'aaaaaaaa-0000-4000-8000-00000000000a';

insert into public.campaign_members (campaign_id, user_id)
values ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('owner')),
       ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('archived')),
       ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('temp_password')),
       ('bbbbbbbb-0000-4000-8000-00000000000b', tests.uid('other_player'));

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from public.campaign_dm where campaign_id in
    ('aaaaaaaa-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-00000000000b')), 2,
  'each campaign got its private row from the AFTER INSERT trigger'
);
select hasnt_column('public', 'campaigns', 'dm_notes', 'dm_notes no longer lives on the readable campaigns row');

select is(
  (select array_agg(p.proname::text order by p.proname)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('is_dm', 'is_active_user', 'is_member')
      and p.prosecdef and p.provolatile = 's'
      and p.proconfig = array['search_path=""']),
  array['is_active_user', 'is_dm', 'is_member'],
  'helpers are SECURITY DEFINER STABLE with an empty search_path'
);
select ok(
  not has_function_privilege('anon', 'public.is_dm()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.is_active_user()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.is_member(uuid)', 'EXECUTE')
  and not has_function_privilege('public', 'public.is_dm()', 'EXECUTE')
  and not has_function_privilege('public', 'public.is_active_user()', 'EXECUTE')
  and not has_function_privilege('public', 'public.is_member(uuid)', 'EXECUTE'),
  'anon and PUBLIC cannot execute the helpers'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename in ('campaigns', 'campaign_members', 'campaign_dm')
      and policyname = 'access_active' and permissive = 'RESTRICTIVE' and roles = '{authenticated}'
      and cmd = 'ALL' and qual = '(is_dm() OR is_active_user())'),
  3,
  'the restrictive active-user policy is on every table of the story'
);
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name in ('campaigns', 'campaign_members', 'campaign_dm')
      and grantee in ('anon', 'PUBLIC')),
  0,
  'anon and PUBLIC hold no privilege on the tables of the story'
);

-- ---------------------------------------------------------------------------
-- Helper results per identity
-- ---------------------------------------------------------------------------
select tests.set_identity('dm');
select ok(public.is_dm() and public.is_active_user(), 'dm: is_dm and is_active_user');
select tests.set_identity('owner');
select ok(not public.is_dm() and public.is_active_user() and public.is_member('aaaaaaaa-0000-4000-8000-00000000000a')
          and not public.is_member('bbbbbbbb-0000-4000-8000-00000000000b'), 'owner: active member of A only');
select tests.set_identity('archived');
select ok(not public.is_active_user() and public.is_member('aaaaaaaa-0000-4000-8000-00000000000a'),
          'archived: member but not active');
select tests.set_identity('temp_password');
select ok(not public.is_active_user(), 'temp_password: not active');
select tests.set_identity('non_member');
select ok(public.is_active_user() and not public.is_member('aaaaaaaa-0000-4000-8000-00000000000a'),
          'non_member: active, member of nothing');
select tests.set_identity('anon');
select throws_ok($$select public.is_dm()$$, '42501', null, 'anon cannot call is_dm');

-- ---------------------------------------------------------------------------
-- campaigns: reads
-- ---------------------------------------------------------------------------
select tests.set_identity('anon');
select throws_ok($$select * from public.campaigns$$, '42501', null, 'anon: campaigns refused');

select tests.set_identity('owner');
select is((select array_agg(name) from public.campaigns), array['Campaign A'], 'owner sees only their campaign');
select throws_ok($$select dm_notes from public.campaigns$$, '42703', null, 'owner cannot select a dm_notes column');

select tests.set_identity('other_player');
select is((select array_agg(name) from public.campaigns), array['Campaign B'], 'other_player sees only B');

select tests.set_identity('archived');
select is((select count(*)::int from public.campaigns), 0, 'archived member sees no campaign');
select tests.set_identity('temp_password');
select is((select count(*)::int from public.campaigns), 0, 'temporary-password member sees no campaign');
select tests.set_identity('non_member');
select is((select count(*)::int from public.campaigns), 0, 'non-member sees no campaign');

select tests.set_identity('dm');
select is((select count(*)::int from public.campaigns where name like 'Campaign %'), 2, 'dm sees every campaign');

-- ---------------------------------------------------------------------------
-- campaigns: writes by non-DM identities (all refused, even the active member)
-- ---------------------------------------------------------------------------
select tests.set_identity('owner');
select throws_ok(
  $$insert into public.campaigns (name) values ('Hijack')$$,
  '42501', null, 'owner cannot create a campaign'
);
select is(tests.rows_affected($$update public.campaigns set name = 'Pwned' where name = 'Campaign A'$$)::int, 0,
          'owner update on their campaign touches 0 rows');
select is(tests.rows_affected($$delete from public.campaigns where name = 'Campaign A'$$)::int, 0,
          'owner delete on their campaign touches 0 rows');
select tests.set_identity('other_player');
select throws_ok($$insert into public.campaigns (name) values ('Hijack')$$, '42501', null, 'other_player cannot create');
select is(tests.rows_affected($$update public.campaigns set name = 'Pwned' where name = 'Campaign B'$$)::int, 0, 'other_player update: 0 rows');
select tests.set_identity('archived');
select throws_ok($$insert into public.campaigns (name) values ('Hijack')$$, '42501', null, 'archived cannot create');
select tests.set_identity('temp_password');
select throws_ok($$insert into public.campaigns (name) values ('Hijack')$$, '42501', null, 'temp_password cannot create');
select tests.set_identity('non_member');
select throws_ok($$insert into public.campaigns (name) values ('Hijack')$$, '42501', null, 'non_member cannot create');
select tests.set_identity('anon');
select throws_ok($$insert into public.campaigns (name) values ('Hijack')$$, '42501', null, 'anon cannot create');

-- DM: positive controls. A new campaign is visible to the DM but to nobody else (no member yet).
select tests.set_identity('dm');
select lives_ok($$insert into public.campaigns (id, name) values ('cccccccc-0000-4000-8000-00000000000c', 'Campaign C')$$,
                'dm creates a campaign');
select is((select count(*)::int from public.campaign_members where campaign_id = 'cccccccc-0000-4000-8000-00000000000c'), 0,
          'the dm is not a member of their own campaign');
select is(tests.rows_affected($$update public.campaigns set description = 'x' where name = 'Campaign C'$$)::int, 1, 'dm updates a campaign');
select tests.set_identity('owner');
select is((select count(*)::int from public.campaigns where name = 'Campaign C'), 0, 'a campaign with no member is invisible to players');
select tests.set_identity('dm');
select lives_ok($$insert into public.campaign_members (campaign_id, user_id)
                  values ('cccccccc-0000-4000-8000-00000000000c', tests.uid('non_member'))$$, 'dm adds a member');
select tests.set_identity('non_member');
select is((select array_agg(name) from public.campaigns), array['Campaign C'], 'the new member now sees the campaign');

-- ---------------------------------------------------------------------------
-- campaign_members
-- ---------------------------------------------------------------------------
select tests.set_identity('anon');
select throws_ok($$select * from public.campaign_members$$, '42501', null, 'anon: campaign_members refused');
select tests.set_identity('owner');
select is((select count(*)::int from public.campaign_members), 1, 'a member reads only their own membership row');
select throws_ok(
  $$insert into public.campaign_members (campaign_id, user_id) values ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('non_member'))$$,
  '42501', null, 'a member cannot add anyone'
);
select throws_ok(
  $$insert into public.campaign_members (campaign_id, user_id) values ('bbbbbbbb-0000-4000-8000-00000000000b', tests.uid('owner'))$$,
  '42501', null, 'a player cannot add themselves to another campaign'
);
select is(tests.rows_affected($$delete from public.campaign_members$$)::int, 0, 'a member cannot remove memberships');
select tests.set_identity('archived');
select is((select count(*)::int from public.campaign_members), 0, 'archived reads no membership');
select tests.set_identity('dm');
select is((select count(*)::int from public.campaign_members), 5, 'dm reads every membership');

-- ---------------------------------------------------------------------------
-- campaign_dm
-- ---------------------------------------------------------------------------
select tests.set_identity('owner');
select is((select count(*)::int from public.campaign_dm), 0, 'a member never reads the private notes');
select is(tests.rows_affected($$update public.campaign_dm set dm_notes = 'pwn'$$)::int, 0, 'a member cannot write them (0 rows)');
select throws_ok($$insert into public.campaign_dm (campaign_id) values ('bbbbbbbb-0000-4000-8000-00000000000b')$$,
                 '42501', null, 'a member cannot insert one');
select tests.set_identity('non_member');
select is((select count(*)::int from public.campaign_dm), 0, 'a non-member reads nothing');
select tests.set_identity('anon');
select throws_ok($$select * from public.campaign_dm$$, '42501', null, 'anon: campaign_dm refused');
select tests.set_identity('dm');
select is((select dm_notes from public.campaign_dm where campaign_id = 'aaaaaaaa-0000-4000-8000-00000000000a'),
          'SECRET A', 'dm reads the private notes');
select is(tests.rows_affected($$update public.campaign_dm set dm_notes = 'new' where campaign_id = 'aaaaaaaa-0000-4000-8000-00000000000a'$$)::int, 1,
          'dm writes the private notes');

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename in ('campaigns', 'campaign_members', 'campaign_dm')
      and (qual = 'true' or with_check = 'true')),
  0, 'no policy is open (true) on the tables of the story'
);
select ok(
  not has_table_privilege('authenticated', 'public.campaigns', 'TRUNCATE')
  and not has_table_privilege('authenticated', 'public.campaigns', 'REFERENCES')
  and not has_table_privilege('authenticated', 'public.campaigns', 'TRIGGER')
  and not has_table_privilege('authenticated', 'public.campaign_members', 'TRUNCATE')
  and not has_table_privilege('authenticated', 'public.campaign_dm', 'TRUNCATE'),
  'authenticated has no TRUNCATE (RLS bypass), REFERENCES or TRIGGER'
);
select ok(
  not has_any_column_privilege('anon', 'public.campaigns', 'SELECT')
  and not has_any_column_privilege('anon', 'public.campaign_members', 'SELECT')
  and not has_any_column_privilege('anon', 'public.campaign_dm', 'SELECT'),
  'anon has no column privilege either'
);
select ok(
  not has_function_privilege('anon', 'public.last_activity_at(public.campaigns)', 'EXECUTE'),
  'anon cannot call the last_activity_at computed field'
);
select tests.set_identity('archived');
select is(tests.rows_affected($$update public.campaigns set name = 'Pwned'$$)::int, 0, 'archived: campaigns update touches 0 rows');
select is(tests.rows_affected($$delete from public.campaigns$$)::int, 0, 'archived: campaigns delete touches 0 rows');
select tests.set_identity('temp_password');
select is(tests.rows_affected($$update public.campaigns set name = 'Pwned'$$)::int, 0, 'temp_password: campaigns update touches 0 rows');
select is(tests.rows_affected($$delete from public.campaigns$$)::int, 0, 'temp_password: campaigns delete touches 0 rows');
select tests.set_identity('non_member');
select is(tests.rows_affected($$update public.campaigns set name = 'Pwned'$$)::int, 0, 'non_member: campaigns update touches 0 rows');
select is(tests.rows_affected($$delete from public.campaigns$$)::int, 0, 'non_member: campaigns delete touches 0 rows');
select tests.set_identity('other_player');
select is(tests.rows_affected($$update public.campaigns set name = 'Pwned'$$)::int, 0, 'other_player: campaigns update touches 0 rows');
select is(tests.rows_affected($$delete from public.campaigns$$)::int, 0, 'other_player: campaigns delete touches 0 rows');
select tests.set_identity('anon');
select throws_ok($$update public.campaigns set name = 'Pwned'$$, '42501', null, 'anon: campaigns update refused');
select throws_ok($$delete from public.campaigns$$, '42501', null, 'anon: campaigns delete refused');
select tests.set_identity('other_player');
select is((select count(*)::int from public.campaign_members), 1, 'other_player: campaign_members read is limited to own active rows');
select throws_ok($$insert into public.campaign_members (campaign_id, user_id) values ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('other_player'))$$, '42501', null, 'other_player: cannot join a campaign');
select is(tests.rows_affected($$delete from public.campaign_members$$)::int, 0, 'other_player: cannot delete memberships');
select tests.set_identity('temp_password');
select is((select count(*)::int from public.campaign_members), 0, 'temp_password: campaign_members read is limited to own active rows');
select throws_ok($$insert into public.campaign_members (campaign_id, user_id) values ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('temp_password'))$$, '42501', null, 'temp_password: cannot join a campaign');
select is(tests.rows_affected($$delete from public.campaign_members$$)::int, 0, 'temp_password: cannot delete memberships');
select tests.set_identity('non_member');
select is((select count(*)::int from public.campaign_members), 1, 'non_member: campaign_members read is limited to own active rows');
select throws_ok($$insert into public.campaign_members (campaign_id, user_id) values ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('non_member'))$$, '42501', null, 'non_member: cannot join a campaign');
select is(tests.rows_affected($$delete from public.campaign_members$$)::int, 0, 'non_member: cannot delete memberships');
select tests.set_identity('archived');
select throws_ok($$insert into public.campaign_members (campaign_id, user_id) values ('bbbbbbbb-0000-4000-8000-00000000000b', tests.uid('archived'))$$, '42501', null, 'archived: cannot join another campaign');
select tests.set_identity('owner');
select is(tests.rows_affected($$update public.campaign_members set campaign_id = 'bbbbbbbb-0000-4000-8000-00000000000b'$$)::int, 0, 'owner: cannot move their membership to another campaign');
select tests.set_identity('anon');
select throws_ok($$insert into public.campaign_members (campaign_id, user_id) values ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('owner'))$$, '42501', null, 'anon: cannot add members');
select tests.set_identity('other_player');
select is((select count(*)::int from public.campaign_dm), 0, 'other_player: private notes invisible');
select is(tests.rows_affected($$update public.campaign_dm set dm_notes = 'pwn'$$)::int, 0, 'other_player: private notes not writable');
select is(tests.rows_affected($$delete from public.campaign_dm$$)::int, 0, 'other_player: private notes not deletable');
select throws_ok($$insert into public.campaign_dm (campaign_id) values ('bbbbbbbb-0000-4000-8000-00000000000b')$$, '42501', null, 'other_player: cannot insert private notes');
select tests.set_identity('archived');
select is((select count(*)::int from public.campaign_dm), 0, 'archived: private notes invisible');
select is(tests.rows_affected($$update public.campaign_dm set dm_notes = 'pwn'$$)::int, 0, 'archived: private notes not writable');
select is(tests.rows_affected($$delete from public.campaign_dm$$)::int, 0, 'archived: private notes not deletable');
select throws_ok($$insert into public.campaign_dm (campaign_id) values ('bbbbbbbb-0000-4000-8000-00000000000b')$$, '42501', null, 'archived: cannot insert private notes');
select tests.set_identity('temp_password');
select is((select count(*)::int from public.campaign_dm), 0, 'temp_password: private notes invisible');
select is(tests.rows_affected($$update public.campaign_dm set dm_notes = 'pwn'$$)::int, 0, 'temp_password: private notes not writable');
select is(tests.rows_affected($$delete from public.campaign_dm$$)::int, 0, 'temp_password: private notes not deletable');
select throws_ok($$insert into public.campaign_dm (campaign_id) values ('bbbbbbbb-0000-4000-8000-00000000000b')$$, '42501', null, 'temp_password: cannot insert private notes');
select tests.set_identity('owner');
select is(tests.rows_affected($$delete from public.campaign_dm$$)::int, 0, 'owner: private notes not deletable');
select tests.set_identity('anon');
select throws_ok($$update public.campaign_dm set dm_notes = 'pwn'$$, '42501', null, 'anon: private notes write refused');
select tests.set_identity('dm');
select is(tests.rows_affected($$update public.campaign_members set created_at = now()$$)::int, 5, 'dm: updates memberships');
select is(tests.rows_affected($$delete from public.campaign_members where campaign_id = 'aaaaaaaa-0000-4000-8000-00000000000a'$$)::int, 3, 'dm: removes memberships');
select is(tests.rows_affected($$delete from public.campaign_dm where campaign_id = 'aaaaaaaa-0000-4000-8000-00000000000a'$$)::int, 1, 'dm: deletes private notes');
select lives_ok($$insert into public.campaign_dm (campaign_id, dm_notes) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'again')$$, 'dm: inserts private notes');
select ok((select updated_at from public.campaign_dm where campaign_id = 'aaaaaaaa-0000-4000-8000-00000000000a') is not null, 'updated_at is kept');
select is(tests.rows_affected($$delete from public.campaigns where name = 'Campaign B'$$)::int, 1, 'dm: deletes a campaign (cascades)');
select tests.reset_identity();
update public.profiles set archived_at = now() where user_id = tests.uid('dm');
select tests.set_identity('dm');
select ok(not public.is_dm(), 'an archived dm is not a dm any more');
select is((select count(*)::int from public.campaigns), 0, 'an archived dm reads no campaign');
select throws_ok($$insert into public.campaigns (name) values ('Late')$$, '42501', null, 'an archived dm cannot create');
select tests.reset_identity();
update public.profiles set archived_at = null, must_change_password = true where user_id = tests.uid('dm');
select tests.set_identity('dm');
select ok(not public.is_dm(), 'a dm on a temporary password is not a dm yet');
select is((select count(*)::int from public.campaigns), 0, 'a dm on a temporary password reads no campaign');

select tests.reset_identity();
select * from finish();
rollback;
