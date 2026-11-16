-- Story 1.7 (AD-1, AD-4, AD-14): sessions, encounters, notes and storage.objects are DM-only.
-- Generated matrix: 7 identities x 3 tables x 4 operations, then the storage bucket.
begin;
select set_config('storage.allow_delete_query', 'true', true);

select plan(133);

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

insert into public.sessions (campaign_id, session_number) values ('aaaaaaaa-0000-4000-8000-00000000000a', 1);
insert into public.encounters (campaign_id, name) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Goblins');
insert into public.notes (campaign_id, title) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Lore');

-- Structure
select policies_are('public', 'sessions', array['sessions_dm_all', 'access_active'], 'sessions: exactly the DM policy and the active-user rule');
select policies_are('public', 'encounters', array['encounters_dm_all', 'access_active'], 'encounters: exactly the DM policy and the active-user rule');
select policies_are('public', 'notes', array['notes_dm_all', 'access_active'], 'notes: exactly the DM policy and the active-user rule');
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename in ('sessions', 'encounters', 'notes')
      and policyname like '%_dm_all' and permissive = 'PERMISSIVE' and qual = 'is_dm()' and with_check = 'is_dm()'),
  3, 'the DM policies are exactly is_dm()'
);
select ok(
  (select count(*) = 0 from information_schema.role_table_grants
    where table_schema = 'public' and table_name in ('sessions', 'encounters', 'notes')
      and grantee in ('anon', 'PUBLIC'))
  and not has_table_privilege('authenticated', 'public.sessions', 'TRUNCATE')
  and not has_table_privilege('authenticated', 'public.encounters', 'TRUNCATE')
  and not has_table_privilege('authenticated', 'public.notes', 'TRUNCATE'),
  'no privilege for anon/PUBLIC, no TRUNCATE for authenticated'
);

-- ---------------- anon
select tests.set_identity('anon');
select throws_ok($$select * from public.sessions$$, '42501', null, 'anon: sessions read refused');
select throws_ok($$insert into public.sessions (campaign_id, session_number) values ('aaaaaaaa-0000-4000-8000-00000000000a', 2)$$, '42501', null, 'anon: sessions insert refused');
select throws_ok($$update public.sessions set name = 'Pwned'$$, '42501', null, 'anon: sessions update refused');
select throws_ok($$delete from public.sessions$$, '42501', null, 'anon: sessions delete refused');
select throws_ok($$select * from public.encounters$$, '42501', null, 'anon: encounters read refused');
select throws_ok($$insert into public.encounters (campaign_id, name) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Hijack')$$, '42501', null, 'anon: encounters insert refused');
select throws_ok($$update public.encounters set name = 'Pwned'$$, '42501', null, 'anon: encounters update refused');
select throws_ok($$delete from public.encounters$$, '42501', null, 'anon: encounters delete refused');
select throws_ok($$select * from public.notes$$, '42501', null, 'anon: notes read refused');
select throws_ok($$insert into public.notes (campaign_id, title) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Hijack')$$, '42501', null, 'anon: notes insert refused');
select throws_ok($$update public.notes set title = 'Pwned'$$, '42501', null, 'anon: notes update refused');
select throws_ok($$delete from public.notes$$, '42501', null, 'anon: notes delete refused');
-- ---------------- owner
select tests.set_identity('owner');
select is((select count(*)::int from public.sessions), 0, 'owner: sessions invisible');
select throws_ok($$insert into public.sessions (campaign_id, session_number) values ('aaaaaaaa-0000-4000-8000-00000000000a', 2)$$, '42501', null, 'owner: sessions insert refused');
select is(tests.rows_affected($$update public.sessions set name = 'Pwned'$$)::int, 0, 'owner: sessions update touches 0 rows');
select is(tests.rows_affected($$delete from public.sessions$$)::int, 0, 'owner: sessions delete touches 0 rows');
select is((select count(*)::int from public.encounters), 0, 'owner: encounters invisible');
select throws_ok($$insert into public.encounters (campaign_id, name) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Hijack')$$, '42501', null, 'owner: encounters insert refused');
select is(tests.rows_affected($$update public.encounters set name = 'Pwned'$$)::int, 0, 'owner: encounters update touches 0 rows');
select is(tests.rows_affected($$delete from public.encounters$$)::int, 0, 'owner: encounters delete touches 0 rows');
select is((select count(*)::int from public.notes), 0, 'owner: notes invisible');
select throws_ok($$insert into public.notes (campaign_id, title) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Hijack')$$, '42501', null, 'owner: notes insert refused');
select is(tests.rows_affected($$update public.notes set title = 'Pwned'$$)::int, 0, 'owner: notes update touches 0 rows');
select is(tests.rows_affected($$delete from public.notes$$)::int, 0, 'owner: notes delete touches 0 rows');
-- ---------------- other_player
select tests.set_identity('other_player');
select is((select count(*)::int from public.sessions), 0, 'other_player: sessions invisible');
select throws_ok($$insert into public.sessions (campaign_id, session_number) values ('aaaaaaaa-0000-4000-8000-00000000000a', 2)$$, '42501', null, 'other_player: sessions insert refused');
select is(tests.rows_affected($$update public.sessions set name = 'Pwned'$$)::int, 0, 'other_player: sessions update touches 0 rows');
select is(tests.rows_affected($$delete from public.sessions$$)::int, 0, 'other_player: sessions delete touches 0 rows');
select is((select count(*)::int from public.encounters), 0, 'other_player: encounters invisible');
select throws_ok($$insert into public.encounters (campaign_id, name) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Hijack')$$, '42501', null, 'other_player: encounters insert refused');
select is(tests.rows_affected($$update public.encounters set name = 'Pwned'$$)::int, 0, 'other_player: encounters update touches 0 rows');
select is(tests.rows_affected($$delete from public.encounters$$)::int, 0, 'other_player: encounters delete touches 0 rows');
select is((select count(*)::int from public.notes), 0, 'other_player: notes invisible');
select throws_ok($$insert into public.notes (campaign_id, title) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Hijack')$$, '42501', null, 'other_player: notes insert refused');
select is(tests.rows_affected($$update public.notes set title = 'Pwned'$$)::int, 0, 'other_player: notes update touches 0 rows');
select is(tests.rows_affected($$delete from public.notes$$)::int, 0, 'other_player: notes delete touches 0 rows');
-- ---------------- archived
select tests.set_identity('archived');
select is((select count(*)::int from public.sessions), 0, 'archived: sessions invisible');
select throws_ok($$insert into public.sessions (campaign_id, session_number) values ('aaaaaaaa-0000-4000-8000-00000000000a', 2)$$, '42501', null, 'archived: sessions insert refused');
select is(tests.rows_affected($$update public.sessions set name = 'Pwned'$$)::int, 0, 'archived: sessions update touches 0 rows');
select is(tests.rows_affected($$delete from public.sessions$$)::int, 0, 'archived: sessions delete touches 0 rows');
select is((select count(*)::int from public.encounters), 0, 'archived: encounters invisible');
select throws_ok($$insert into public.encounters (campaign_id, name) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Hijack')$$, '42501', null, 'archived: encounters insert refused');
select is(tests.rows_affected($$update public.encounters set name = 'Pwned'$$)::int, 0, 'archived: encounters update touches 0 rows');
select is(tests.rows_affected($$delete from public.encounters$$)::int, 0, 'archived: encounters delete touches 0 rows');
select is((select count(*)::int from public.notes), 0, 'archived: notes invisible');
select throws_ok($$insert into public.notes (campaign_id, title) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Hijack')$$, '42501', null, 'archived: notes insert refused');
select is(tests.rows_affected($$update public.notes set title = 'Pwned'$$)::int, 0, 'archived: notes update touches 0 rows');
select is(tests.rows_affected($$delete from public.notes$$)::int, 0, 'archived: notes delete touches 0 rows');
-- ---------------- temp_password
select tests.set_identity('temp_password');
select is((select count(*)::int from public.sessions), 0, 'temp_password: sessions invisible');
select throws_ok($$insert into public.sessions (campaign_id, session_number) values ('aaaaaaaa-0000-4000-8000-00000000000a', 2)$$, '42501', null, 'temp_password: sessions insert refused');
select is(tests.rows_affected($$update public.sessions set name = 'Pwned'$$)::int, 0, 'temp_password: sessions update touches 0 rows');
select is(tests.rows_affected($$delete from public.sessions$$)::int, 0, 'temp_password: sessions delete touches 0 rows');
select is((select count(*)::int from public.encounters), 0, 'temp_password: encounters invisible');
select throws_ok($$insert into public.encounters (campaign_id, name) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Hijack')$$, '42501', null, 'temp_password: encounters insert refused');
select is(tests.rows_affected($$update public.encounters set name = 'Pwned'$$)::int, 0, 'temp_password: encounters update touches 0 rows');
select is(tests.rows_affected($$delete from public.encounters$$)::int, 0, 'temp_password: encounters delete touches 0 rows');
select is((select count(*)::int from public.notes), 0, 'temp_password: notes invisible');
select throws_ok($$insert into public.notes (campaign_id, title) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Hijack')$$, '42501', null, 'temp_password: notes insert refused');
select is(tests.rows_affected($$update public.notes set title = 'Pwned'$$)::int, 0, 'temp_password: notes update touches 0 rows');
select is(tests.rows_affected($$delete from public.notes$$)::int, 0, 'temp_password: notes delete touches 0 rows');
-- ---------------- non_member
select tests.set_identity('non_member');
select is((select count(*)::int from public.sessions), 0, 'non_member: sessions invisible');
select throws_ok($$insert into public.sessions (campaign_id, session_number) values ('aaaaaaaa-0000-4000-8000-00000000000a', 2)$$, '42501', null, 'non_member: sessions insert refused');
select is(tests.rows_affected($$update public.sessions set name = 'Pwned'$$)::int, 0, 'non_member: sessions update touches 0 rows');
select is(tests.rows_affected($$delete from public.sessions$$)::int, 0, 'non_member: sessions delete touches 0 rows');
select is((select count(*)::int from public.encounters), 0, 'non_member: encounters invisible');
select throws_ok($$insert into public.encounters (campaign_id, name) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Hijack')$$, '42501', null, 'non_member: encounters insert refused');
select is(tests.rows_affected($$update public.encounters set name = 'Pwned'$$)::int, 0, 'non_member: encounters update touches 0 rows');
select is(tests.rows_affected($$delete from public.encounters$$)::int, 0, 'non_member: encounters delete touches 0 rows');
select is((select count(*)::int from public.notes), 0, 'non_member: notes invisible');
select throws_ok($$insert into public.notes (campaign_id, title) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Hijack')$$, '42501', null, 'non_member: notes insert refused');
select is(tests.rows_affected($$update public.notes set title = 'Pwned'$$)::int, 0, 'non_member: notes update touches 0 rows');
select is(tests.rows_affected($$delete from public.notes$$)::int, 0, 'non_member: notes delete touches 0 rows');
-- access_active in effect
select tests.reset_identity();
create policy tmp_open on public.sessions for all to authenticated using (true) with check (true);
create policy tmp_open on public.encounters for all to authenticated using (true) with check (true);
create policy tmp_open on public.notes for all to authenticated using (true) with check (true);
select tests.set_identity('owner');
select ok((select count(*)::int from public.sessions) > 0, 'owner: sees sessions once a permissive policy exists');
select ok((select count(*)::int from public.encounters) > 0, 'owner: sees encounters once a permissive policy exists');
select ok((select count(*)::int from public.notes) > 0, 'owner: sees notes once a permissive policy exists');
select tests.set_identity('archived');
select is((select count(*)::int from public.sessions), 0, 'archived: still sees nothing in sessions (restrictive rule)');
select throws_ok($$insert into public.sessions (campaign_id, session_number) values ('aaaaaaaa-0000-4000-8000-00000000000a', 2)$$, '42501', null, 'archived: still cannot insert into sessions');
select is((select count(*)::int from public.encounters), 0, 'archived: still sees nothing in encounters (restrictive rule)');
select throws_ok($$insert into public.encounters (campaign_id, name) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Hijack')$$, '42501', null, 'archived: still cannot insert into encounters');
select is((select count(*)::int from public.notes), 0, 'archived: still sees nothing in notes (restrictive rule)');
select throws_ok($$insert into public.notes (campaign_id, title) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Hijack')$$, '42501', null, 'archived: still cannot insert into notes');
select tests.set_identity('temp_password');
select is((select count(*)::int from public.sessions), 0, 'temp_password: still sees nothing in sessions (restrictive rule)');
select throws_ok($$insert into public.sessions (campaign_id, session_number) values ('aaaaaaaa-0000-4000-8000-00000000000a', 2)$$, '42501', null, 'temp_password: still cannot insert into sessions');
select is((select count(*)::int from public.encounters), 0, 'temp_password: still sees nothing in encounters (restrictive rule)');
select throws_ok($$insert into public.encounters (campaign_id, name) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Hijack')$$, '42501', null, 'temp_password: still cannot insert into encounters');
select is((select count(*)::int from public.notes), 0, 'temp_password: still sees nothing in notes (restrictive rule)');
select throws_ok($$insert into public.notes (campaign_id, title) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Hijack')$$, '42501', null, 'temp_password: still cannot insert into notes');
select tests.reset_identity();
drop policy tmp_open on public.sessions;
drop policy tmp_open on public.encounters;
drop policy tmp_open on public.notes;
select tests.set_identity('dm');
select ok((select count(*)::int from public.sessions) > 0, 'dm: reads sessions');
select ok((select count(*)::int from public.encounters) > 0, 'dm: reads encounters');
select ok((select count(*)::int from public.notes) > 0, 'dm: reads notes');
select lives_ok($$insert into public.sessions (campaign_id, session_number) values ('aaaaaaaa-0000-4000-8000-00000000000a', 2)$$, 'dm: inserts into sessions');
select ok(tests.rows_affected($$update public.sessions set name = 'Pwned'$$)::int >= 1, 'dm: updates sessions');
select ok(tests.rows_affected($$delete from public.sessions$$)::int >= 1, 'dm: deletes from sessions');
select lives_ok($$insert into public.encounters (campaign_id, name) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Hijack')$$, 'dm: inserts into encounters');
select ok(tests.rows_affected($$update public.encounters set name = 'Pwned'$$)::int >= 1, 'dm: updates encounters');
select ok(tests.rows_affected($$delete from public.encounters$$)::int >= 1, 'dm: deletes from encounters');
select lives_ok($$insert into public.notes (campaign_id, title) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Hijack')$$, 'dm: inserts into notes');
select ok(tests.rows_affected($$update public.notes set title = 'Pwned'$$)::int >= 1, 'dm: updates notes');
select ok(tests.rows_affected($$delete from public.notes$$)::int >= 1, 'dm: deletes from notes');

-- ---------------- storage.objects and the portraits bucket
select tests.reset_identity();
select is((select public from storage.buckets where id = 'character-portraits'), false, 'the portraits bucket is private');
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (roles && array['public'::name, 'anon'::name] or qual = 'true' or with_check = 'true')),
  0, 'no storage policy applies to anon/public or is open'
);
select policies_are('storage', 'objects', array['storage_dm_all', 'access_active'], 'storage.objects: exactly the DM policy and the active-user rule');
insert into storage.objects (bucket_id, name, owner_id) values ('character-portraits', 'seed/portrait.jpg', tests.uid('dm')::text);
select tests.set_identity('anon');
select is((select count(*)::int from storage.objects), 0, 'anon: no storage object visible');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('character-portraits', 'x/portrait.jpg')$$, '42501', null, 'anon: cannot upload');
select is(tests.rows_affected($$delete from storage.objects$$)::int, 0, 'anon: cannot delete');

select tests.set_identity('owner');
select is((select count(*)::int from storage.objects where bucket_id = 'character-portraits'), 0, 'owner: no portrait visible');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('character-portraits', 'x/portrait.jpg')$$, '42501', null, 'owner: cannot upload');
select is(tests.rows_affected($$update storage.objects set name = 'y/portrait.jpg'$$)::int, 0, 'owner: cannot rename');
select is(tests.rows_affected($$delete from storage.objects$$)::int, 0, 'owner: cannot delete');
select tests.set_identity('other_player');
select is((select count(*)::int from storage.objects where bucket_id = 'character-portraits'), 0, 'other_player: no portrait visible');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('character-portraits', 'x/portrait.jpg')$$, '42501', null, 'other_player: cannot upload');
select is(tests.rows_affected($$update storage.objects set name = 'y/portrait.jpg'$$)::int, 0, 'other_player: cannot rename');
select is(tests.rows_affected($$delete from storage.objects$$)::int, 0, 'other_player: cannot delete');
select tests.set_identity('archived');
select is((select count(*)::int from storage.objects where bucket_id = 'character-portraits'), 0, 'archived: no portrait visible');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('character-portraits', 'x/portrait.jpg')$$, '42501', null, 'archived: cannot upload');
select is(tests.rows_affected($$update storage.objects set name = 'y/portrait.jpg'$$)::int, 0, 'archived: cannot rename');
select is(tests.rows_affected($$delete from storage.objects$$)::int, 0, 'archived: cannot delete');
select tests.set_identity('temp_password');
select is((select count(*)::int from storage.objects where bucket_id = 'character-portraits'), 0, 'temp_password: no portrait visible');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('character-portraits', 'x/portrait.jpg')$$, '42501', null, 'temp_password: cannot upload');
select is(tests.rows_affected($$update storage.objects set name = 'y/portrait.jpg'$$)::int, 0, 'temp_password: cannot rename');
select is(tests.rows_affected($$delete from storage.objects$$)::int, 0, 'temp_password: cannot delete');
select tests.set_identity('non_member');
select is((select count(*)::int from storage.objects where bucket_id = 'character-portraits'), 0, 'non_member: no portrait visible');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('character-portraits', 'x/portrait.jpg')$$, '42501', null, 'non_member: cannot upload');
select is(tests.rows_affected($$update storage.objects set name = 'y/portrait.jpg'$$)::int, 0, 'non_member: cannot rename');
select is(tests.rows_affected($$delete from storage.objects$$)::int, 0, 'non_member: cannot delete');
select tests.set_identity('dm');
select is((select count(*)::int from storage.objects where bucket_id = 'character-portraits'), 1, 'dm: sees the portrait');
select lives_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('character-portraits', 'new/portrait.jpg', 'x')$$, 'dm: uploads');
select is(tests.rows_affected($$delete from storage.objects where bucket_id = 'character-portraits'$$)::int, 2, 'dm: deletes');


select tests.reset_identity();
select * from finish();
rollback;
