-- Epic 4 (FR16-FR19, D-10, D-11, D-12): personal notes and shared notes of a campaign.
--
--   notes_personal  one notebook per player and campaign; readable by its author and by the DM, WRITTEN ONLY by
--                   the author (the DM reads, never edits: D-10).
--   notes_shared    the table's notes; every active member of the campaign reads and creates, the author edits and
--                   deletes their own, the DM moderates all (D-11, D-12). The DM's own `notes` table stays DM-only.
--
-- Text is plain text (displayed escaped by the front), capped by CHECK. No concurrent-edit handling (D-12):
-- the last save wins.

begin;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.notes_personal (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  author_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null default '' check (char_length(title) <= 200),
  body        text not null default '' check (char_length(body) <= 10000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index notes_personal_campaign_author_idx on public.notes_personal (campaign_id, author_id);

create table public.notes_shared (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  -- Kept (null) when the account disappears: the table's note outlives its author.
  author_id   uuid default auth.uid() references auth.users (id) on delete set null,
  title       text not null check (char_length(btrim(title)) between 1 and 200),
  category    text not null default 'general'
              check (category in ('lore', 'npc', 'location', 'quest', 'item', 'general')),
  pinned      boolean not null default false,
  body        text not null default '' check (char_length(body) <= 10000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index notes_shared_campaign_idx on public.notes_shared (campaign_id, pinned desc, updated_at desc);

create trigger notes_personal_updated_at
  before update on public.notes_personal
  for each row execute function public.update_updated_at_column();

create trigger notes_shared_updated_at
  before update on public.notes_shared
  for each row execute function public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- A row never changes campaign nor author (a note cannot be moved to another campaign or re-attributed).
-- Not SECURITY DEFINER: it only reads the row and the caller's role. Reused by the session comments (epic 5).
-- ---------------------------------------------------------------------------

create or replace function public.guard_row_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
begin
  if (current_user = 'anon' or (current_user = 'authenticated' and not public.is_dm()))
     and (n->>'campaign_id' is distinct from o->>'campaign_id'
          or n->>'author_id' is distinct from o->>'author_id'
          or n->>'session_id' is distinct from o->>'session_id') then
    raise exception 'campaign, session and author of a row cannot be changed' using errcode = '42501';
  end if;
  return new;
end
$$;

revoke execute on function public.guard_row_identity() from public, anon, authenticated;

create trigger notes_personal_guard_identity
  before update on public.notes_personal
  for each row execute function public.guard_row_identity();

create trigger notes_shared_guard_identity
  before update on public.notes_shared
  for each row execute function public.guard_row_identity();

-- ---------------------------------------------------------------------------
-- Privileges and policies
-- ---------------------------------------------------------------------------

alter table public.notes_personal enable row level security;
alter table public.notes_shared enable row level security;

revoke all on public.notes_personal, public.notes_shared from public, anon, authenticated;
grant select, delete on public.notes_personal, public.notes_shared to authenticated;
-- Column privileges: the API can never set `id`, `author_id` (database default auth.uid()), `campaign_id` after the
-- insert, nor the timestamps (a forged `updated_at` would keep a note on top of the list for ever).
grant insert (campaign_id, title, body) on public.notes_personal to authenticated;
grant update (title, body) on public.notes_personal to authenticated;
grant insert (campaign_id, title, category, pinned, body) on public.notes_shared to authenticated;
grant update (title, category, pinned, body) on public.notes_shared to authenticated;

-- notes_personal: the author (still a member) does everything on their own notes; the DM only reads.
create policy notes_personal_author_all on public.notes_personal
  for all to authenticated
  using (author_id = (select auth.uid()) and public.is_member(campaign_id))
  with check (author_id = (select auth.uid()) and public.is_member(campaign_id));

create policy notes_personal_dm_select on public.notes_personal
  for select to authenticated
  using (public.is_dm());

-- notes_shared: members read and create (as themselves); the author edits and deletes; the DM does everything.
create policy notes_shared_member_select on public.notes_shared
  for select to authenticated
  using (public.is_member(campaign_id));

create policy notes_shared_member_insert on public.notes_shared
  for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_member(campaign_id));

create policy notes_shared_author_update on public.notes_shared
  for update to authenticated
  using (author_id = (select auth.uid()) and public.is_member(campaign_id))
  with check (author_id = (select auth.uid()) and public.is_member(campaign_id));

create policy notes_shared_author_delete on public.notes_shared
  for delete to authenticated
  using (author_id = (select auth.uid()) and public.is_member(campaign_id));

create policy notes_shared_dm_all on public.notes_shared
  for all to authenticated
  using (public.is_dm())
  with check (public.is_dm());

-- The active-user rule (AD-4): an archived or temporary-password account is out, whatever else says yes.
create policy access_active on public.notes_personal
  as restrictive for all to authenticated
  using (public.is_dm() or public.is_active_user());

create policy access_active on public.notes_shared
  as restrictive for all to authenticated
  using (public.is_dm() or public.is_active_user());

-- ---------------------------------------------------------------------------
-- Who wrote what: the pseudos of a campaign's members (and the DM), for the active members and the DM only.
-- `profiles` is not readable by a player, so a SECURITY DEFINER function hands out just these two columns.
-- ---------------------------------------------------------------------------

create or replace function public.campaign_member_names(p_campaign_id uuid)
returns table (user_id uuid, pseudo text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id, p.pseudo
    from public.profiles p
   where (public.is_dm() or (public.is_active_user() and public.is_member(p_campaign_id)))
     and (p.role = 'dm'
          or p.user_id in (select m.user_id from public.campaign_members m where m.campaign_id = p_campaign_id)
          -- A player who left keeps being named on what they wrote (the DM keeps reading their notebook).
          or p.user_id in (select n.author_id from public.notes_shared n where n.campaign_id = p_campaign_id)
          or (public.is_dm()
              and p.user_id in (select n.author_id from public.notes_personal n where n.campaign_id = p_campaign_id)))
$$;

revoke execute on function public.campaign_member_names(uuid) from public, anon;
grant execute on function public.campaign_member_names(uuid) to authenticated;

commit;
