-- Stories 3.6, 3.7, 3.9 (FR14, FR15, D-15): who reads what of a character.
--
--   * Every active member of a campaign reads the PCs of that campaign (sheet, inventory, level history), never its
--     NPCs, and never a campaign they are not a member of. An archived PC (disabled with its owner) stays readable.
--   * The private part of a sheet (`character_private`: backstory, notes) is read and written by the OWNER and the DM
--     only. Another player gets no row at all, and the two fields are not columns of `characters` any more.
--   * A reassignment by the DM (3.9) is immediate: policies read `owner_user_id` on every statement.
--
-- `can_read_character` is the single definition of "this character is visible to me": its owner (member), or any
-- member when it is a PC. SECURITY DEFINER so it does not recurse through the policies of `characters`.

create or replace function public.can_read_character(character_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.characters c
    where c.id = can_read_character.character_id
      and public.is_member(c.campaign_id)
      and (c.character_type = 'pc' or c.owner_user_id = (select auth.uid()))
  )
$$;

revoke execute on function public.can_read_character(uuid) from public, anon;
grant execute on function public.can_read_character(uuid) to authenticated;

-- characters: the PCs of my campaigns (the owner policy of story 3.1 still covers an owned NPC, if the DM made one).
create policy characters_member_select_pcs on public.characters
  for select to authenticated
  using (character_type = 'pc' and public.is_member(campaign_id));

-- Inventory and level history: readable wherever the character is (the owner-only SELECT policies are replaced).
drop policy character_items_owner_select on public.character_items;
drop policy character_build_levels_owner_select on public.character_build_levels;

create policy character_items_member_select on public.character_items
  for select to authenticated
  using (public.can_read_character(character_id));

create policy character_build_levels_member_select on public.character_build_levels
  for select to authenticated
  using (public.can_read_character(character_id));

-- character_private: the owner also writes (their character must be active, like the rest of the sheet). The row is
-- created by the AFTER INSERT trigger of `characters`; a player never inserts or deletes it.
create policy character_private_owner_update on public.character_private
  for update to authenticated
  using (public.owns_active_character(character_id))
  with check (public.owns_active_character(character_id));
