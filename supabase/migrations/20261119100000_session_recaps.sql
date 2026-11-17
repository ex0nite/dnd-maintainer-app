-- Epic 5 (FR20-FR22, D-14): the DM publishes a session recap, members read and comment it, the DM moderates.
--
--   sessions.summary_published   written by the DM only (the DM is the only role with write rights on `sessions`);
--   a member reads a session only once its recap is published (title, date, recap: notes, loot and XP live in
--   `session_dm`, DM-only, so `select *` gives a player nothing private);
--   session_comments             members comment a PUBLISHED recap of their campaign; the author edits and deletes
--   their own, the DM moderates all. Unpublishing hides the comments from the players without deleting them.

begin;

alter table public.sessions add column summary_published boolean not null default false;

-- A comment is bound to a session of ITS OWN campaign: the pair (session, campaign) is a foreign key.
alter table public.sessions add constraint sessions_id_campaign_key unique (id, campaign_id);

create table public.session_comments (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  session_id  uuid not null,
  -- Kept (null) when the account disappears: the comment outlives its author.
  author_id   uuid default auth.uid() references auth.users (id) on delete set null,
  body        text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (session_id, campaign_id) references public.sessions (id, campaign_id) on delete cascade on update cascade
);

create index session_comments_session_idx on public.session_comments (session_id, created_at);
create index session_comments_campaign_idx on public.session_comments (campaign_id);

create trigger session_comments_updated_at
  before update on public.session_comments
  for each row execute function public.update_updated_at_column();

create trigger session_comments_guard_identity
  before update on public.session_comments
  for each row execute function public.guard_row_identity();

-- ---------------------------------------------------------------------------
-- Privileges and policies
-- ---------------------------------------------------------------------------

alter table public.session_comments enable row level security;

revoke all on public.session_comments from public, anon, authenticated;
grant select, delete on public.session_comments to authenticated;
-- No `id`, `author_id` (database default auth.uid()) or timestamp from the API; no move to another session.
grant insert (campaign_id, session_id, body) on public.session_comments to authenticated;
grant update (body) on public.session_comments to authenticated;

-- A policy filters rows, not columns: a member reading a published session also reads `previous_slugs`, which holds the
-- OLD titles of the session. They are cleared at the moment of publication (and run last, after the slug trigger),
-- so a title that was never published cannot be read.
create or replace function public.clear_previous_slugs_on_publish()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.summary_published and not old.summary_published then
    new.previous_slugs := array[]::text[];
  end if;
  return new;
end
$$;

revoke execute on function public.clear_previous_slugs_on_publish() from public, anon, authenticated;

-- "zz": after trigger_manage_slug, which appends the old slug when a session is renamed in the same statement.
create trigger sessions_zz_clear_previous_slugs
  before update on public.sessions
  for each row execute function public.clear_previous_slugs_on_publish();

-- Members read the sessions whose recap is published (the DM keeps `sessions_dm_all`).
create policy sessions_member_published on public.sessions
  for select to authenticated
  using (summary_published and public.is_member(campaign_id));

-- "The recap of this session is published": evaluated with the caller's own rights, so a session a member cannot
-- read (not published, other campaign) is simply not found.
create policy session_comments_member_select on public.session_comments
  for select to authenticated
  using (
    public.is_member(campaign_id)
    and exists (select 1 from public.sessions s where s.id = session_id and s.summary_published)
  );

create policy session_comments_member_insert on public.session_comments
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.is_member(campaign_id)
    and exists (select 1 from public.sessions s where s.id = session_id and s.summary_published)
  );

create policy session_comments_author_update on public.session_comments
  for update to authenticated
  using (
    author_id = (select auth.uid())
    and public.is_member(campaign_id)
    and exists (select 1 from public.sessions s where s.id = session_id and s.summary_published)
  )
  with check (
    author_id = (select auth.uid())
    and public.is_member(campaign_id)
    and exists (select 1 from public.sessions s where s.id = session_id and s.summary_published)
  );

create policy session_comments_author_delete on public.session_comments
  for delete to authenticated
  using (
    author_id = (select auth.uid())
    and public.is_member(campaign_id)
    and exists (select 1 from public.sessions s where s.id = session_id and s.summary_published)
  );

create policy session_comments_dm_all on public.session_comments
  for all to authenticated
  using ((select public.is_dm()))
  with check ((select public.is_dm()));

create policy access_active on public.session_comments
  as restrictive for all to authenticated
  using (public.is_dm() or public.is_active_user());

-- ---------------------------------------------------------------------------
-- Names: the authors of the comments are named too (also after they left the campaign).
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
          -- (a comment of a session that is not published is not a member's business, only the DM's)
          or p.user_id in (
            select c.author_id from public.session_comments c
              join public.sessions s on s.id = c.session_id
             where c.campaign_id = p_campaign_id and (s.summary_published or public.is_dm()))
          or (public.is_dm()
              and p.user_id in (select n.author_id from public.notes_personal n where n.campaign_id = p_campaign_id)))
$$;

revoke execute on function public.campaign_member_names(uuid) from public, anon;
grant execute on function public.campaign_member_names(uuid) to authenticated;

commit;
