-- Story 1.7 / AD-1, AD-4: the rest of the schema and the storage are closed to everyone but the DM.
-- After this migration no table of `public` and no object of `storage` is readable or writable
-- without a DM (or, later, a policy added together with its test).

begin;

-- ---------------------------------------------------------------------------
-- sessions, encounters, notes
-- ---------------------------------------------------------------------------

drop policy "Allow all access to sessions" on public.sessions;
drop policy "Allow all access to encounters" on public.encounters;
drop policy "Allow all access to notes" on public.notes;

alter table public.sessions enable row level security;
alter table public.encounters enable row level security;
alter table public.notes enable row level security;

revoke all on public.sessions, public.encounters, public.notes from public, anon, authenticated;
grant select, insert, update, delete on public.sessions, public.encounters, public.notes to authenticated;

create policy sessions_dm_all on public.sessions
  for all to authenticated using (public.is_dm()) with check (public.is_dm());
create policy encounters_dm_all on public.encounters
  for all to authenticated using (public.is_dm()) with check (public.is_dm());
create policy notes_dm_all on public.notes
  for all to authenticated using (public.is_dm()) with check (public.is_dm());

create policy access_active on public.sessions
  as restrictive for all to authenticated using (public.is_dm() or public.is_active_user());
create policy access_active on public.encounters
  as restrictive for all to authenticated using (public.is_dm() or public.is_active_user());
create policy access_active on public.notes
  as restrictive for all to authenticated using (public.is_dm() or public.is_active_user());

-- ---------------------------------------------------------------------------
-- Storage: the four open portrait policies go, the bucket becomes private.
-- Portraits are read through short-lived signed URLs (created by the signed-in user's
-- session, which the policy below allows), never through a public URL.
-- ---------------------------------------------------------------------------

drop policy if exists "character-portraits: public select" on storage.objects;
drop policy if exists "character-portraits: public insert" on storage.objects;
drop policy if exists "character-portraits: public update" on storage.objects;
drop policy if exists "character-portraits: public delete" on storage.objects;

update storage.buckets set public = false where id = 'character-portraits';

-- Existing characters stored the public URL of their portrait: keep only the storage path.
update public.characters
   set portrait_url = regexp_replace(portrait_url, '^.*/character-portraits/', '')
 where portrait_url like '%/character-portraits/%';

create policy storage_dm_all on storage.objects
  for all to authenticated using (public.is_dm()) with check (public.is_dm());

-- Applies to every bucket, present and future.
create policy access_active on storage.objects
  as restrictive for all to authenticated using (public.is_dm() or public.is_active_user());

-- ---------------------------------------------------------------------------
-- anon gets nothing, including by default
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
-- Functions are executable by PUBLIC by default: take it back. The ones the app calls are granted
-- explicitly to authenticated (helpers and last_activity_at already are).
revoke execute on all functions in schema public from public, anon;
grant execute on function public.last_activity_at(public.campaigns) to authenticated;

-- Future objects created by the migration role must not be handed to anon either.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;

commit;
