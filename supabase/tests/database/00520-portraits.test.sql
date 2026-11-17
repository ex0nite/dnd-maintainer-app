-- Story 3.8 (AD-8): portraits in the private bucket, who writes, who reads, and the path CHECK.
begin;

select set_config('storage.allow_delete_query', 'true', true);
select plan(45);

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

-- C1 Alice PC, C2 Bob PC, C3 NPC of A, C5 PC of B (nobody is a member of B)
insert into public.characters (id, campaign_id, name, character_type, owner_user_id)
values ('c1000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Alice PC', 'pc', tests.uid('owner')),
       ('c2000000-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Bob PC', 'pc', tests.uid('other_player')),
       ('c3000000-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Innkeeper', 'npc', null),
       ('c5000000-0000-4000-8000-000000000005', 'bbbbbbbb-0000-4000-8000-00000000000b', 'Elsewhere', 'pc', null);

-- Objects put there by the DM (the storage service does this for real uploads).
insert into storage.objects (bucket_id, name, owner_id)
values ('character-portraits', 'c2000000-0000-4000-8000-000000000002/b0000000-0000-4000-8000-0000000000b2.jpg', tests.uid('dm')::text),
       ('character-portraits', 'c3000000-0000-4000-8000-000000000003/b0000000-0000-4000-8000-0000000000b3.jpg', tests.uid('dm')::text),
       ('character-portraits', 'c5000000-0000-4000-8000-000000000005/b0000000-0000-4000-8000-0000000000b5.jpg', tests.uid('dm')::text);

-- Structure -----------------------------------------------------------------------------------------------------------
select policies_are('storage', 'objects',
  array['storage_dm_all', 'portraits_member_select', 'portraits_owner_insert', 'portraits_owner_update', 'portraits_owner_delete', 'access_active'],
  'storage.objects: DM, the four portrait policies, the active-user rule');
select is(
  (select file_size_limit::int from storage.buckets where id = 'character-portraits'), 1048576,
  'the bucket limits uploads to 1 MB'
);
select is(
  (select allowed_mime_types from storage.buckets where id = 'character-portraits'),
  array['image/jpeg', 'image/png', 'image/webp'],
  'and to image types'
);
select is((select public from storage.buckets where id = 'character-portraits'), false, 'the bucket stays private');
select is(public.portrait_character_id('c1000000-0000-4000-8000-000000000001/b0000000-0000-4000-8000-0000000000b1.png'), 'c1000000-0000-4000-8000-000000000001'::uuid, 'name parser: a good name');
select is(public.portrait_character_id('c1000000-0000-4000-8000-000000000001/portrait.jpg'), 'c1000000-0000-4000-8000-000000000001'::uuid, 'name parser: the legacy name');
select is(
  (select count(*)::int from unnest(array[
    'not-a-uuid/b0000000-0000-4000-8000-0000000000b1.jpg',
    'c1000000-0000-4000-8000-000000000001/not-a-uuid.jpg',
    'c1000000-0000-4000-8000-000000000001/b0000000-0000-4000-8000-0000000000b1.gif',
    'c1000000-0000-4000-8000-000000000001/sub/b0000000-0000-4000-8000-0000000000b1.jpg',
    'c1000000-0000-4000-8000-000000000001/../c2000000-0000-4000-8000-000000000002/portrait.jpg',
    'c1000000-0000-4000-8000-000000000001',
    'C1000000-0000-4000-8000-000000000001/b0000000-0000-4000-8000-0000000000b1.jpg',
    'c1000000-0000-4000-8000-000000000001/b0000000-0000-4000-8000-0000000000b1.jpg.png',
    'c1000000-0000-4000-8000-000000000001/b0000000-0000-4000-8000-0000000000b1.jpg' || E'\n',
    'c1000000-0000-4000-8000-000000000001%2Fportrait.jpg',
    ''
  ]) n where public.portrait_character_id(n) is not null),
  0, 'name parser: anything else gives null'
);

-- anon ------------------------------------------------------------------------------------------------------------------
select tests.set_identity('anon');
-- (anon keeps table privileges on storage.objects, owned by the storage role: RLS is the barrier, so 0 rows, not an error)
select is((select count(*)::int from storage.objects), 0, 'anon: reads no object');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('character-portraits', 'c1000000-0000-4000-8000-000000000001/b0000000-0000-4000-8000-0000000000b1.jpg')$$, '42501', null, 'anon: cannot upload');
select is(tests.rows_affected($$delete from storage.objects$$)::int, 0, 'anon: deletes nothing');

-- owner: uploads to their own character only -------------------------------------------------------------------------
select tests.set_identity('owner');
select lives_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('character-portraits', 'c1000000-0000-4000-8000-000000000001/b0000000-0000-4000-8000-0000000000b1.jpg', auth.uid()::text)$$, 'owner: uploads a portrait to their own character');
select lives_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('character-portraits', 'c1000000-0000-4000-8000-000000000001/b0000000-0000-4000-8000-0000000000b4.webp', auth.uid()::text)$$, 'owner: a second, webp, object (replacement)');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('character-portraits', 'c2000000-0000-4000-8000-000000000002/b0000000-0000-4000-8000-0000000000b6.jpg', auth.uid()::text)$$, '42501', null, 'owner: cannot upload to another player''s character');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('character-portraits', 'c3000000-0000-4000-8000-000000000003/b0000000-0000-4000-8000-0000000000b7.jpg', auth.uid()::text)$$, '42501', null, 'owner: cannot upload to an NPC');
select throws_ok($$update storage.objects set name = 'c3000000-0000-4000-8000-000000000003/b0000000-0000-4000-8000-0000000000be.jpg' where name like 'c1000000%b1.jpg'$$, '42501', null, 'owner: cannot rename their object into an NPC folder');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('character-portraits', 'not-a-uuid/b0000000-0000-4000-8000-0000000000b8.jpg', auth.uid()::text)$$, '42501', null, 'owner: a segment that is not a UUID is refused');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('character-portraits', 'c1000000-0000-4000-8000-000000000001/portrait.gif', auth.uid()::text)$$, '42501', null, 'owner: a bad file name is refused');
select throws_ok($$update storage.objects set name = 'c2000000-0000-4000-8000-000000000002/b0000000-0000-4000-8000-0000000000b9.jpg' where name like 'c1000000%b1.jpg'$$, '42501', null, 'owner: cannot rename their object into another character''s folder');
select is(tests.rows_affected($$update storage.objects set name = name where name like 'c2000000%'$$)::int, 0, 'owner: cannot replace another player''s object');
select is(tests.rows_affected($$delete from storage.objects where name like 'c2000000%'$$)::int, 0, 'owner: cannot delete another player''s portrait');
select is((select count(*)::int from storage.objects), 3, 'owner: reads their two objects and the PC portrait of Bob, not the NPC nor campaign B');
select is(tests.rows_affected($$delete from storage.objects where name like 'c1000000%b4.webp'$$)::int, 1, 'owner: deletes their old portrait');

-- other_player -----------------------------------------------------------------------------------------------------
select tests.set_identity('other_player');
select is((select count(*)::int from storage.objects where name like 'c1000000%'), 1, 'other_player: reads the PC portrait of Alice');
select is(tests.rows_affected($$delete from storage.objects where name like 'c1000000%'$$)::int, 0, 'other_player: cannot delete Alice''s portrait');
select is(tests.rows_affected($$update storage.objects set name = name where name like 'c1000000%'$$)::int, 0, 'other_player: cannot replace it');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('character-portraits', 'c1000000-0000-4000-8000-000000000001/b0000000-0000-4000-8000-0000000000ba.jpg', auth.uid()::text)$$, '42501', null, 'other_player: cannot upload to Alice''s character');

-- the others -------------------------------------------------------------------------------------------------------------
select tests.set_identity('non_member');
select is((select count(*)::int from storage.objects), 0, 'non_member: no portrait');
select tests.set_identity('archived');
select is((select count(*)::int from storage.objects), 0, 'archived: no portrait');
select tests.set_identity('temp_password');
select is((select count(*)::int from storage.objects), 0, 'temp_password: no portrait');

-- a deactivated character is frozen: no upload for its owner
select tests.reset_identity();
update public.characters set is_active = false where id = 'c1000000-0000-4000-8000-000000000001';
select tests.set_identity('owner');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('character-portraits', 'c1000000-0000-4000-8000-000000000001/b0000000-0000-4000-8000-0000000000bb.jpg', auth.uid()::text)$$, '42501', null, 'owner: no upload on a deactivated character');
select tests.reset_identity();
update public.characters set is_active = true where id = 'c1000000-0000-4000-8000-000000000001';

-- the cap: at most 5 objects per character, and only the portrait bucket
select tests.set_identity('owner');
select lives_ok($$insert into storage.objects (bucket_id, name, owner_id) select 'character-portraits', 'c1000000-0000-4000-8000-000000000001/e000000' || n || '-0000-4000-8000-000000000000.jpg', auth.uid()::text from generate_series(1, 4) n$$, 'owner: fills the folder up to the cap (5 objects)');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('character-portraits', 'c1000000-0000-4000-8000-000000000001/e0000009-0000-4000-8000-000000000000.jpg', auth.uid()::text)$$, '42501', null, 'owner: the 6th object of a character is refused');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('some-other-bucket', 'c1000000-0000-4000-8000-000000000001/b0000000-0000-4000-8000-0000000000bd.jpg', auth.uid()::text)$$, '42501', null, 'owner: a valid name in another bucket is refused');
select is(tests.rows_affected($$delete from storage.objects where name like 'c1000000%e000000%'$$)::int, 4, 'owner: frees the room by deleting');
select tests.reset_identity();

-- a deactivated (not archived) PC is withdrawn: its mates no longer read its portrait either
update public.characters set is_active = false where id = 'c2000000-0000-4000-8000-000000000002';
select tests.set_identity('owner');
select is((select count(*)::int from storage.objects where name like 'c2000000%'), 0, 'mates no longer read the portrait of a PC the DM deactivated');
select tests.set_identity('other_player');
select is(tests.rows_affected($$delete from storage.objects where name like 'c2000000%'$$)::int, 0, 'its frozen owner cannot delete its portrait');
select tests.reset_identity();
update public.characters set is_active = true where id = 'c2000000-0000-4000-8000-000000000002';

-- the DM -------------------------------------------------------------------------------------------------------------------
select tests.set_identity('dm');
select is((select count(*)::int from storage.objects), 4, 'dm: reads every object');
select lives_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('character-portraits', 'c3000000-0000-4000-8000-000000000003/b0000000-0000-4000-8000-0000000000bc.jpg', auth.uid()::text)$$, 'dm: uploads an NPC portrait');
select is(tests.rows_affected($$update storage.objects set name = name where name like 'c3000000%bc.jpg'$$)::int, 1, 'dm: replaces an object');
select is(tests.rows_affected($$delete from storage.objects where name like 'c3000000%bc.jpg'$$)::int, 1, 'dm: deletes an object');

-- The path CHECK on characters.portrait_url ------------------------------------------------------------------------------
select tests.set_identity('owner');
select is(tests.rows_affected($$update public.characters set portrait_url = 'c1000000-0000-4000-8000-000000000001/b0000000-0000-4000-8000-0000000000b1.jpg' where id = 'c1000000-0000-4000-8000-000000000001'$$)::int, 1, 'owner: stores their own portrait path');
select is(tests.rows_affected($$update public.characters set portrait_url = 'c1000000-0000-4000-8000-000000000001/portrait.jpg' where id = 'c1000000-0000-4000-8000-000000000001'$$)::int, 1, 'owner: the legacy path is accepted too');
select throws_ok($$update public.characters set portrait_url = 'c2000000-0000-4000-8000-000000000002/b0000000-0000-4000-8000-0000000000b2.jpg' where id = 'c1000000-0000-4000-8000-000000000001'$$, '23514', null, 'owner: another character''s path is refused');
select throws_ok($$update public.characters set portrait_url = 'https://evil.example/x.jpg' where id = 'c1000000-0000-4000-8000-000000000001'$$, '23514', null, 'owner: an external URL is refused');
select throws_ok($$update public.characters set portrait_url = 'c1000000-0000-4000-8000-000000000001/not-a-uuid.jpg' where id = 'c1000000-0000-4000-8000-000000000001'$$, '23514', null, 'owner: a segment that is not a UUID is refused');

select tests.reset_identity();
select * from finish();
rollback;
