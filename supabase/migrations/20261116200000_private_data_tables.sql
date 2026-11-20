-- Story 1.5 / AD-5: DM-only and owner-only data leaves the readable tables.
--
-- A column can not be hidden from a role that may read the row, so what a player must never
-- read lives in tables of its own:
--   character_private  (backstory, notes)       -> the character's owner and the DM
--   session_dm         (notes, loot, XP)        -> the DM only
-- (campaign_dm arrived with story 1.4.) The old columns are dropped after the data is copied.
-- Rows are created by AFTER INSERT triggers, so the app never has to create them.

-- One transaction: the lock below needs it, and a half-applied move of private data must not exist.
begin;

-- No insert may slip between the copy below and the triggers that make the private rows.
lock table public.characters, public.sessions in access exclusive mode;

-- ---------------------------------------------------------------------------
-- Character ownership (nullable: existing characters have no account yet, story 3.9 assigns)
-- ---------------------------------------------------------------------------

alter table public.characters
  add column owner_user_id uuid references auth.users (id) on delete set null,
  add column archived_with_owner boolean not null default false;

create index characters_owner_user_id_idx on public.characters (owner_user_id);

create or replace function public.owns_character(character_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.characters c
    where c.id = owns_character.character_id
      and c.owner_user_id = (select auth.uid())
      -- AD-4: an owner who is no longer a member of the campaign loses the access too.
      and public.is_member(c.campaign_id)
  )
$$;

revoke execute on function public.owns_character(uuid) from public, anon;
grant execute on function public.owns_character(uuid) to authenticated;

-- Ownership can only be changed by the DM (or a privileged server-side role such as
-- account-admin). Until story 1.6 closes the policies of `characters`, this trigger is what
-- stops a player from re-assigning a character to themselves to read its private part.
create or replace function public.guard_character_ownership()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.owner_user_id is distinct from old.owner_user_id
      or new.archived_with_owner is distinct from old.archived_with_owner)
     and (current_user = 'anon' or (current_user = 'authenticated' and not public.is_dm())) then
    raise exception 'only the DM can change the owner of a character' using errcode = '42501';
  end if;
  return new;
end
$$;

revoke execute on function public.guard_character_ownership() from public, anon, authenticated;

create trigger characters_guard_ownership
  before update on public.characters
  for each row execute function public.guard_character_ownership();

-- ---------------------------------------------------------------------------
-- Private tables
-- ---------------------------------------------------------------------------

create table public.character_private (
  character_id uuid primary key references public.characters (id) on delete cascade,
  backstory    text,
  notes        text,
  updated_at   timestamptz not null default now()
);

create table public.session_dm (
  session_id         uuid primary key references public.sessions (id) on delete cascade,
  notes              text,
  loot               jsonb default '[]'::jsonb,
  experience_awarded integer not null default 0,
  updated_at         timestamptz not null default now()
);

alter table public.character_private enable row level security;
alter table public.session_dm enable row level security;

-- Copy, then drop: nothing is lost (every existing row gets its private row).
insert into public.character_private (character_id, backstory, notes)
select id, backstory, notes from public.characters;

insert into public.session_dm (session_id, notes, loot, experience_awarded)
select id, notes, loot, experience_awarded from public.sessions;

alter table public.characters drop column backstory, drop column notes;
alter table public.sessions drop column notes, drop column loot, drop column experience_awarded;

-- New rows get their private row automatically.
create or replace function public.create_character_private_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.character_private (character_id) values (new.id) on conflict do nothing;
  return new;
end
$$;

create or replace function public.create_session_dm_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.session_dm (session_id) values (new.id) on conflict do nothing;
  return new;
end
$$;

revoke execute on function public.create_character_private_row(), public.create_session_dm_row()
  from public, anon, authenticated;

create trigger characters_create_private_row
  after insert on public.characters
  for each row execute function public.create_character_private_row();

create trigger sessions_create_dm_row
  after insert on public.sessions
  for each row execute function public.create_session_dm_row();

create trigger character_private_updated_at
  before update on public.character_private
  for each row execute function public.update_updated_at_column();

create trigger session_dm_updated_at
  before update on public.session_dm
  for each row execute function public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Privileges and policies
-- ---------------------------------------------------------------------------

revoke all on public.character_private, public.session_dm from public, anon, authenticated;
grant select, insert, update, delete on public.character_private, public.session_dm to authenticated;

-- DM: everything.
create policy character_private_dm_all on public.character_private
  for all to authenticated
  using (public.is_dm())
  with check (public.is_dm());

create policy session_dm_dm_all on public.session_dm
  for all to authenticated
  using (public.is_dm())
  with check (public.is_dm());

-- The owner reads their own character's private part (writes arrive with epic 3).
create policy character_private_owner_select on public.character_private
  for select to authenticated
  using (public.owns_character(character_id));

-- The active-user rule (AD-4): an archived or temporary-password account is out, whatever else says yes.
create policy access_active on public.character_private
  as restrictive for all to authenticated
  using (public.is_dm() or public.is_active_user());

create policy access_active on public.session_dm
  as restrictive for all to authenticated
  using (public.is_dm() or public.is_active_user());

commit;
