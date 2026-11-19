-- Story 9.7: the 2014 rules have a sheet engine (species, classes and backgrounds of the SRD 5.1, the 2014 builder).
--
-- `ruleset_has_engine()` (story 9.1) gates the finalization of a character: it was true for 2024 only. A campaign on the
-- 2014 rules can now finalize its characters. Spells and spellcasting of 2014 arrive with story 9.8; until then a 2014
-- caster's sheet carries its spellcasting as feature text.
--
-- A new migration rather than an edit of 20261120000000: that one is deployed.

create or replace function public.ruleset_has_engine(p_ruleset text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_ruleset in ('2014', '2024')
$$;

revoke execute on function public.ruleset_has_engine(text) from public, anon, authenticated;
