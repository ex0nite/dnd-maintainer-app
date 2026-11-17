-- Story 2.3 (AD-3, AD-11): the temporary password serves once, and the sign-in address never changes.
--
-- 1. `must_change_password` goes back to false by itself when the password really changes
--    (trigger on auth.users): the player cannot clear the flag, and nothing in the front is trusted.
--    A password reset by the DM (story 2.4) changes the password FIRST, then the service raises the flag again.
-- 2. A trigger refuses any change of `auth.users.email` / `email_change`: the sign-in address is derived from
--    the pseudo and GoTrue cannot be configured to forbid a user changing it (spike 2.1, docs/auth-spike.md).
--    Consequence: account removal must be a hard delete (GoTrue soft delete rewrites the email).

create or replace function public.clear_must_change_password()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set must_change_password = false
   where user_id = new.id
     and must_change_password;
  return null;
end;
$$;

revoke all on function public.clear_must_change_password() from public, anon, authenticated;

create trigger clear_must_change_password
  after update of encrypted_password on auth.users
  for each row
  when (old.encrypted_password is distinct from new.encrypted_password)
  execute function public.clear_must_change_password();

create or replace function public.refuse_address_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.email is distinct from old.email
     or coalesce(new.email_change, '') <> coalesce(old.email_change, '') then
    raise exception 'The sign-in address is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.refuse_address_change() from public, anon, authenticated;

create trigger refuse_address_change
  before update on auth.users
  for each row
  execute function public.refuse_address_change();
