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
-- The guard fails CLOSED: only the DM (an `authenticated` session whose profile is the DM's), the administration key
-- (service_role, account-admin), the database owner roles (postgres, supabase_admin: migrations, and SECURITY DEFINER
-- functions such as archive_player, story 2.5) and the authentication server go through. Every other role is guarded.
-- A player cannot pick the id of a new character: the slug is built from it and could otherwise collide with, or
-- impersonate through `previous_slugs`, the slug of another character.
-- Trigger order is alphabetical: `characters_guard_ownership` runs BEFORE `characters_manage_slug` (so a slug chosen
-- by the client is refused before the server rewrites it) and BEFORE `characters_zz_clear_archive_mark`.

create or replace function public.guard_character_ownership()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role', 'supabase_auth_admin')
     or (current_user = 'authenticated' and public.is_dm()) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.id := gen_random_uuid();
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
-- characters: the owner reads, creates and updates their own rows (a character the DM deactivated is frozen: no write). No DELETE for a player (story 3.9: DM only).
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
  using (owner_user_id = (select auth.uid()) and public.is_member(campaign_id) and is_active)
  with check (owner_user_id = (select auth.uid()) and public.is_member(campaign_id) and is_active);

-- Write access to the inventory and the level history: the owner of an ACTIVE character (a deactivated character is
-- frozen for its owner, who can still read it). Reading stays with owns_character().
create or replace function public.owns_active_character(character_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.characters c
    where c.id = owns_active_character.character_id
      and c.owner_user_id = (select auth.uid())
      and c.is_active
      and public.is_member(c.campaign_id)
  )
$$;

revoke execute on function public.owns_active_character(uuid) from public, anon;
grant execute on function public.owns_active_character(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Inventory and level history: the owner reads; writes need an active character (owns_active_character).
-- ---------------------------------------------------------------------------

create policy character_items_owner_select on public.character_items
  for select to authenticated
  using (public.owns_character(character_id));

create policy character_items_owner_write on public.character_items
  for all to authenticated
  using (public.owns_active_character(character_id))
  with check (public.owns_active_character(character_id));

create policy character_build_levels_owner_select on public.character_build_levels
  for select to authenticated
  using (public.owns_character(character_id));

create policy character_build_levels_owner_write on public.character_build_levels
  for all to authenticated
  using (public.owns_active_character(character_id))
  with check (public.owns_active_character(character_id));
