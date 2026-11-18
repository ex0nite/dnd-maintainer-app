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
