-- Story 1.6 / AD-1, AD-4: characters, their inventory and their level history are closed to
-- everyone but the DM. Player access (own character, then campaign mates) is added with
-- epic 3, one policy at a time, each with its pgTAP matrix.

begin;

drop policy "Allow all access to characters" on public.characters;
drop policy "Allow all access to character_build_levels" on public.character_build_levels;
drop policy "Allow all access to character_items" on public.character_items;

-- Row-level security was enabled in the first migration; stating it again documents the intent
-- and protects against a future migration that disables it.
alter table public.characters enable row level security;
alter table public.character_build_levels enable row level security;
alter table public.character_items enable row level security;

-- Supabase gives anon and authenticated every privilege on new tables: take it all back,
-- then give the verbs back to authenticated only (the policies narrow them to the DM).
revoke all on public.characters, public.character_build_levels, public.character_items
  from public, anon, authenticated;
grant select, insert, update, delete
  on public.characters, public.character_build_levels, public.character_items
  to authenticated;

create policy characters_dm_all on public.characters
  for all to authenticated
  using (public.is_dm())
  with check (public.is_dm());

create policy character_build_levels_dm_all on public.character_build_levels
  for all to authenticated
  using (public.is_dm())
  with check (public.is_dm());

create policy character_items_dm_all on public.character_items
  for all to authenticated
  using (public.is_dm())
  with check (public.is_dm());

-- The active-user rule (AD-4), restrictive: it ANDs with whatever permissive policy epic 3 adds.
create policy access_active on public.characters
  as restrictive for all to authenticated
  using (public.is_dm() or public.is_active_user());

create policy access_active on public.character_build_levels
  as restrictive for all to authenticated
  using (public.is_dm() or public.is_active_user());

create policy access_active on public.character_items
  as restrictive for all to authenticated
  using (public.is_dm() or public.is_active_user());

commit;
