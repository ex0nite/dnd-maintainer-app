-- Story 3.1 (FR8, AD-6): a player reads and writes THEIR characters, and only theirs.
--
-- The owner (characters.owner_user_id = auth.uid(), still a member of the campaign) reads and writes the character,
-- its inventory and its level history. The DM keeps everything (the *_dm_all policies). Everyone else gets nothing
-- from these policies. The restrictive `access_active` policy still ANDs with them: an archived account or one on a
-- temporary password reads and writes nothing, whatever the permissive policies say.
--
-- Columns a player must never set are guarded by a trigger rather than by policies (a policy cannot compare old and
-- new values):
--   INSERT: no slug (the server generates it), no previous_slugs, active, not archived_with_owner.
--           (owner, type pc, campaign membership are checked by the INSERT policy.)
--   UPDATE: owner_user_id, campaign_id, character_type, is_active, archived_with_owner, slug, previous_slugs and id
--           cannot change.
-- The guard applies to `authenticated` users who are not the DM, and to `anon` (who has no privilege anyway). The DM,
-- the administration key (service_role, account-admin: archiving, story 2.5) and migrations (postgres) go through.
-- Trigger order is alphabetical: `characters_guard_ownership` runs BEFORE `characters_manage_slug` (so a slug chosen
-- by the client is refused before the server rewrites it) and BEFORE `characters_zz_clear_archive_mark`.

create or replace function public.guard_character_ownership()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Only a signed-in non-DM user (or anon) is restricted.
  if not (current_user = 'anon' or (current_user = 'authenticated' and not public.is_dm())) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.slug, '') <> ''
       or coalesce(array_length(new.previous_slugs, 1), 0) > 0
       or new.is_active is distinct from true
       or new.archived_with_owner then
      raise exception 'a player cannot set the slug, the activation or the archive mark of a character'
        using errcode = '42501';
    end if;
  else
    if new.id is distinct from old.id
       or new.owner_user_id is distinct from old.owner_user_id
       or new.campaign_id is distinct from old.campaign_id
       or new.character_type is distinct from old.character_type
       or new.is_active is distinct from old.is_active
       or new.archived_with_owner is distinct from old.archived_with_owner
       or new.slug is distinct from old.slug
       or new.previous_slugs is distinct from old.previous_slugs then
      raise exception 'only the DM can change the owner, campaign, type, activation or slug of a character'
        using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;

drop trigger characters_guard_ownership on public.characters;
create trigger characters_guard_ownership
  before insert or update on public.characters
  for each row execute function public.guard_character_ownership();

-- ---------------------------------------------------------------------------
-- characters: the owner reads, creates and updates their own rows. No DELETE for a player (story 3.9: DM only).
-- ---------------------------------------------------------------------------

create policy characters_owner_select on public.characters
  for select to authenticated
  using (owner_user_id = (select auth.uid()) and public.is_member(campaign_id));

create policy characters_owner_insert on public.characters
  for insert to authenticated
  with check (
    owner_user_id = (select auth.uid())
    and character_type = 'pc'
    and public.is_member(campaign_id)
  );

create policy characters_owner_update on public.characters
  for update to authenticated
  using (owner_user_id = (select auth.uid()) and public.is_member(campaign_id))
  with check (owner_user_id = (select auth.uid()) and public.is_member(campaign_id));

-- ---------------------------------------------------------------------------
-- Inventory and level history: everything for the owner of the character (owns_character also requires membership).
-- ---------------------------------------------------------------------------

create policy character_items_owner_all on public.character_items
  for all to authenticated
  using (public.owns_character(character_id))
  with check (public.owns_character(character_id));

create policy character_build_levels_owner_all on public.character_build_levels
  for all to authenticated
  using (public.owns_character(character_id))
  with check (public.owns_character(character_id));
