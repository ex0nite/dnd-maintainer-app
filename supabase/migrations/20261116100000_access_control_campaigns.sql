-- Story 1.4 / AD-3, AD-4: access helpers, campaign membership, locked-down campaigns.
--
-- Model: the DM (profiles.role = 'dm') does everything; a player sees a campaign only if
-- they are an ACTIVE member of it (not archived, not on a temporary password). The "active"
-- rule is a RESTRICTIVE policy, so it ANDs with every permissive policy: a forgotten
-- "owner" rule can never re-open the door for an archived or temporary-password account.
--
-- The DM's private campaign notes leave the readable `campaigns` row for `campaign_dm`
-- (AD-5): a player-readable table must never carry a DM-only column. (Pulled forward from
-- story 1.5 because "a member reads campaigns, never dm_notes" cannot hold otherwise.)

-- ---------------------------------------------------------------------------
-- Helper functions (AD-4): SECURITY DEFINER so they read `profiles` / `campaign_members`
-- without recursing through their own policies; empty search_path, qualified names;
-- never callable by anon.
-- ---------------------------------------------------------------------------

create or replace function public.is_dm()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid())
      and p.role = 'dm'
      and p.archived_at is null
      and p.must_change_password = false
  )
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid())
      and p.archived_at is null
      and p.must_change_password = false
  )
$$;

-- ---------------------------------------------------------------------------
-- campaign_members: who plays in which campaign. Written by the DM only.
-- ---------------------------------------------------------------------------

create table public.campaign_members (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

create index campaign_members_user_id_idx on public.campaign_members (user_id);

alter table public.campaign_members enable row level security;

create or replace function public.is_member(campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.campaign_members m
    where m.campaign_id = is_member.campaign_id
      and m.user_id = (select auth.uid())
  )
$$;

-- ---------------------------------------------------------------------------
-- campaign_dm: DM-only campaign notes, moved out of `campaigns`.
-- ---------------------------------------------------------------------------

create table public.campaign_dm (
  campaign_id uuid primary key references public.campaigns (id) on delete cascade,
  dm_notes    text not null default '',
  updated_at  timestamptz not null default now()
);

alter table public.campaign_dm enable row level security;

insert into public.campaign_dm (campaign_id, dm_notes)
select id, coalesce(dm_notes, '') from public.campaigns;

alter table public.campaigns drop column dm_notes;

-- Every new campaign gets its (empty) private row, so the app never has to create it.
create or replace function public.create_campaign_dm_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.campaign_dm (campaign_id) values (new.id) on conflict do nothing;
  return new;
end
$$;

create trigger campaign_dm_updated_at
  before update on public.campaign_dm
  for each row execute function public.update_updated_at_column();

create trigger campaigns_create_dm_row
  after insert on public.campaigns
  for each row execute function public.create_campaign_dm_row();

-- ---------------------------------------------------------------------------
-- Privileges: nothing for anon; authenticated gets the verbs, policies narrow them.
-- ---------------------------------------------------------------------------

revoke all on public.campaign_members, public.campaign_dm from public, anon, authenticated;
revoke all on public.campaigns from public, anon, authenticated;
grant select, insert, update, delete on public.campaign_members, public.campaign_dm to authenticated;
grant select, insert, update, delete on public.campaigns to authenticated;

revoke execute on function public.is_dm(), public.is_active_user(), public.is_member(uuid)
  from public, anon;
grant execute on function public.is_dm(), public.is_active_user(), public.is_member(uuid)
  to authenticated;
-- Story 1.2's computed field was granted to anon; anon has nothing on campaigns any more.
revoke execute on function public.last_activity_at(public.campaigns) from public, anon;

-- The trigger function is only ever fired by the trigger.
revoke execute on function public.create_campaign_dm_row() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

-- profiles (story 1.2 gave everyone their own row): the DM also reads all profiles.
create policy profiles_select_dm on public.profiles
  for select to authenticated
  using (public.is_dm());

drop policy "Allow all access to campaigns" on public.campaigns;

create policy campaigns_dm_all on public.campaigns
  for all to authenticated
  using (public.is_dm())
  with check (public.is_dm());

create policy campaigns_member_select on public.campaigns
  for select to authenticated
  using (public.is_member(id));

create policy campaign_members_dm_all on public.campaign_members
  for all to authenticated
  using (public.is_dm())
  with check (public.is_dm());

create policy campaign_members_select_own on public.campaign_members
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy campaign_dm_dm_all on public.campaign_dm
  for all to authenticated
  using (public.is_dm())
  with check (public.is_dm());

-- The active-user rule, restrictive, on every table of this story (profiles stays outside:
-- a user must read their own profile to learn they have to change their password).
create policy access_active on public.campaigns
  as restrictive for all to authenticated
  using (public.is_dm() or public.is_active_user());

create policy access_active on public.campaign_members
  as restrictive for all to authenticated
  using (public.is_dm() or public.is_active_user());

create policy access_active on public.campaign_dm
  as restrictive for all to authenticated
  using (public.is_dm() or public.is_active_user());
