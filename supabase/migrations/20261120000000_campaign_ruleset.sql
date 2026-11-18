-- Story 9.1: the rules edition of a campaign.
--
-- A campaign follows the 2014 or the 2024 rules. Existing campaigns stay on 2024. The edition can be changed while
-- the campaign has no finalized character: once a character is `ready`, its sheet was computed with one edition and
-- switching would silently change it. The database refuses the change (not only the interface), whoever asks.
--
-- Only the DM writes `campaigns` (policy campaigns_dm_all); members read the row, so they read the edition too.

alter table public.campaigns
  add column ruleset text not null default '2024'
  constraint campaigns_ruleset_check check (ruleset in ('2014', '2024'));

create or replace function public.campaigns_lock_ruleset()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.ruleset is distinct from old.ruleset
     and exists (
       select 1 from public.characters c
       where c.campaign_id = old.id and c.status = 'ready'
     ) then
    raise exception 'The rules of this campaign can not change once a character is finalized'
      using errcode = '23514', constraint = 'campaigns_ruleset_locked';
  end if;
  return new;
end
$$;

-- Only the trigger calls it.
revoke execute on function public.campaigns_lock_ruleset() from public, anon, authenticated;

create trigger campaigns_lock_ruleset
  before update of ruleset on public.campaigns
  for each row execute function public.campaigns_lock_ruleset();

-- ---------------------------------------------------------------------------
-- The other direction: a character can not be finalized, or moved, against the rules of its campaign.
--
-- The trigger above protects the edition once a sheet exists. This one protects the sheet: a character becomes `ready`
-- only in a campaign whose edition has a sheet engine, and a finalized character only moves between campaigns that
-- follow the same edition. The check lives in the database because the interface cache can be five minutes old and a
-- player can write `characters` directly (policy characters_owner_update).
--
-- `for share` on the campaign row conflicts with the row lock of an UPDATE of `campaigns`: a finalization and an edition
-- change racing each other are serialized instead of both passing.
-- ---------------------------------------------------------------------------

-- Editions whose sheet engine exists. Grows with epic 9 (stories 9.5 to 9.8).
create or replace function public.ruleset_has_engine(p_ruleset text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_ruleset = '2024'
$$;

revoke execute on function public.ruleset_has_engine(text) from public, anon, authenticated;

create or replace function public.characters_check_ruleset()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ruleset text;
  v_old_ruleset text;
begin
  if new.status is distinct from 'ready' then
    return new;
  end if;

  select c.ruleset into v_ruleset from public.campaigns c where c.id = new.campaign_id for share;

  if tg_op = 'UPDATE' and old.status = 'ready' and old.campaign_id is distinct from new.campaign_id then
    -- A finalized sheet moves: both campaigns must follow the same edition.
    select c.ruleset into v_old_ruleset from public.campaigns c where c.id = old.campaign_id;
    if v_old_ruleset is distinct from v_ruleset then
      raise exception 'A finalized character can not move to a campaign that follows other rules'
        using errcode = '23514', constraint = 'characters_ruleset_move';
    end if;
  elsif (tg_op = 'INSERT' or old.status is distinct from 'ready') and not public.ruleset_has_engine(v_ruleset) then
    raise exception 'Character sheets for the % rules are not available yet: the character can not be finalized', v_ruleset
      using errcode = '23514', constraint = 'characters_ruleset_engine';
  end if;

  return new;
end
$$;

revoke execute on function public.characters_check_ruleset() from public, anon, authenticated;

create trigger characters_check_ruleset
  before insert or update of status, campaign_id on public.characters
  for each row execute function public.characters_check_ruleset();
