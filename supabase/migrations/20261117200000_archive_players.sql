-- Story 2.5 (AD-2, D-30): archive and reactivate a player in ONE transaction.
--
-- `archived_at` is what cuts the access at once: the restrictive policy `access_active` reads it through
-- is_active_user(), so a still-valid access token reads nothing. The functions are for account-admin only
-- (`service_role`); the service adds the authentication ban (login refused) around them.
--
-- Archiving: stamp the profile, end every session, disable the characters the player OWNS and mark them
-- `archived_with_owner`. Reactivating: clear the stamp and re-enable ONLY the characters marked that way (a character
-- the DM had disabled by hand stays disabled). The DM account and unknown ids are refused (D-31).
-- Both are idempotent so the service can simply be retried after a failed authentication-side step.

create or replace function public.archive_player(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  select role into v_role from public.profiles where user_id = p_user_id for update;
  if v_role is null then
    raise exception 'unknown account' using errcode = 'P0002';
  end if;
  if v_role <> 'player' then
    raise exception 'only a player account can be archived' using errcode = '42501';
  end if;

  update public.profiles set archived_at = now() where user_id = p_user_id and archived_at is null;

  update public.characters
     set is_active = false,
         archived_with_owner = true
   where owner_user_id = p_user_id
     and is_active;

  delete from auth.sessions where user_id = p_user_id;
end;
$$;

create or replace function public.reactivate_player(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  select role into v_role from public.profiles where user_id = p_user_id for update;
  if v_role is null then
    raise exception 'unknown account' using errcode = 'P0002';
  end if;
  if v_role <> 'player' then
    raise exception 'only a player account can be reactivated' using errcode = '42501';
  end if;

  update public.profiles set archived_at = null where user_id = p_user_id;

  update public.characters
     set is_active = true,
         archived_with_owner = false
   where owner_user_id = p_user_id
     and archived_with_owner;
end;
$$;

revoke all on function public.archive_player(uuid), public.reactivate_player(uuid) from public, anon, authenticated;
grant execute on function public.archive_player(uuid), public.reactivate_player(uuid) to service_role;

-- `archived_with_owner` means "disabled BECAUSE its owner was archived". It must not outlive that meaning: when the
-- DM enables/disables the character by hand, or gives it to someone else, the mark is dropped, so a later
-- reactivation never switches back something the DM decided otherwise. The archive/reactivate functions change the
-- mark in the same statement, which this trigger leaves alone. Named to run AFTER guard_character_ownership
-- (alphabetical order), so the guard still sees the caller's own change only.
create or replace function public.clear_stale_archive_mark()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.archived_with_owner is not distinct from old.archived_with_owner
     and (new.is_active is distinct from old.is_active
          or new.owner_user_id is distinct from old.owner_user_id) then
    new.archived_with_owner := false;
  end if;
  return new;
end;
$$;

revoke all on function public.clear_stale_archive_mark() from public, anon, authenticated;

create trigger characters_zz_clear_archive_mark
  before update on public.characters
  for each row execute function public.clear_stale_archive_mark();
