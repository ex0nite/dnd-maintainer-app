-- Story 3.8 (FR13, AD-8): player portraits in the PRIVATE bucket `character-portraits`.
--
-- Objects are named `<character-id>/<random-uuid>.<jpg|png|webp>` (the earlier `<character-id>/portrait.jpg` of
-- story 1.7 stays valid, for reading, replacing and deleting). The database keeps the PATH, never a URL, and the
-- browser asks for a short-lived signed URL.
--
--   * Write (upload, replace, delete): the owner of an ACTIVE character, or the DM.
--   * Read: whoever can read the character (any active member for a PC, the owner for their own, the DM): the portrait
--     of an NPC is unreadable for a player. A visitor reads, writes and deletes nothing (no policy for anon).
--   * Limits: 1 MB and image types, set on the bucket (enforced by the storage service).
--   * `characters.portrait_url` must be the character's OWN path in one of the two shapes (CHECK), so a segment that is
--     not a UUID, another character's path or an external URL is refused.

-- The character an object name belongs to; null when the name does not have the expected shape (the policies then
-- say no). Immutable and without table access: safe to call from a policy.
create or replace function public.portrait_character_id(object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)|portrait\.jpg)$'
      then split_part(object_name, '/', 1)::uuid
  end
$$;

revoke execute on function public.portrait_character_id(text) from public, anon;
grant execute on function public.portrait_character_id(text) to authenticated;

update storage.buckets
   set file_size_limit = 1048576,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'character-portraits';

alter table public.characters drop constraint characters_portrait_path_check;
alter table public.characters
  add constraint characters_portrait_path_check
  check (
    portrait_url is null
    or portrait_url ~ ('^' || id::text || '/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)|portrait\.jpg)$')
  );

-- A player cannot fill the disk: at most 5 objects per character (a replacement briefly holds two).
create or replace function public.portrait_object_count(p_character_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from storage.objects o
   where o.bucket_id = 'character-portraits'
     and split_part(o.name, '/', 1) = p_character_id::text
$$;

revoke execute on function public.portrait_object_count(uuid) from public, anon;
grant execute on function public.portrait_object_count(uuid) to authenticated;

create policy portraits_member_select on storage.objects
  for select to authenticated
  using (bucket_id = 'character-portraits' and public.can_read_character(public.portrait_character_id(name)));

create policy portraits_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'character-portraits'
    and public.owns_active_character(public.portrait_character_id(name))
    and public.portrait_object_count(public.portrait_character_id(name)) < 5
  );

create policy portraits_owner_update on storage.objects
  for update to authenticated
  using (bucket_id = 'character-portraits' and public.owns_active_character(public.portrait_character_id(name)))
  with check (bucket_id = 'character-portraits' and public.owns_active_character(public.portrait_character_id(name)));

create policy portraits_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'character-portraits' and public.owns_active_character(public.portrait_character_id(name)));
