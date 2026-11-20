-- Story 1.2 / AD-3, AD-15: identity table.
--
-- `profiles` is the single source of truth for who a user is (role, pseudo,
-- active state). Nobody who connects through the API can write it: rows are
-- created by the account-admin module (service key) only. The "single DM"
-- rule (D-31) is enforced by a partial unique index, so no route can ever
-- create a second DM.

create table public.profiles (
  user_id              uuid primary key references auth.users (id) on delete cascade,
  pseudo               text not null,
  role                 text not null check (role in ('dm', 'player')),
  must_change_password boolean not null default true,
  archived_at          timestamptz,
  created_at           timestamptz not null default now(),
  constraint profiles_pseudo_format check (pseudo ~ '^[a-z0-9_-]{3,20}$')
);

comment on table public.profiles is
  'Identity and role of each account (AD-3). No write privilege for API roles: written by account-admin only.';

-- One pseudo per person, case-insensitively (the format check already forces lower case).
create unique index profiles_pseudo_unique on public.profiles (lower(pseudo));

-- One DM only (D-31, AD-15).
create unique index profiles_single_dm on public.profiles (role) where role = 'dm';

alter table public.profiles enable row level security;

-- Everyone reads their own profile, even when archived or still on a temporary
-- password: the front needs it to know it must send the user to the
-- password-change screen. The DM read-all policy arrives with is_dm() (story 1.4).
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

-- No API role writes here, and anon reads nothing. Supabase default privileges
-- grant everything to anon/authenticated on new tables: take it all back, then
-- give back the one thing allowed.
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
