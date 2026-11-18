-- Story 9.3: the DM's rules library (docs/rules-as-data.md §3.5, decision D-35).
--
-- One library per rules edition, not per campaign: the single DM keeps one set of rules for 2014 and one for 2024, and
-- every campaign of that edition reads it. Reads: active members of a campaign of that edition, and the DM. Writes: the
-- DM only. Anonymous and non-members read nothing (AD-14).
--
-- The DM is trusted but the MCP writes on their behalf, so the table defends itself. These guards are the floor, the
-- full strict schema is Zod (src/lib/rules/schemas.ts), run by the app and the MCP before writing and by the app again
-- when reading (an invalid entry is ignored, never resolved):
--   * content is a JSON object of at most 65536 bytes;
--   * at most 2000 entries per (ruleset, kind);
--   * validate_rule_entry(kind, content): envelope keys, body keys per kind, kebab-case id, bounded strings (4000
--     characters) and arrays (100 elements), and no string that looks like markup, a link or a script;
--   * revision increments on every update (created_at, revision are never set by the API);
--   * an entry used by a character (rule_entry_users) or named by another entry (rule_entry_references) can not be
--     deleted, and an entry used by a character can not receive review notes.
--
-- These guards are a STRUCTURAL FLOOR, not the full validation: the strict Zod schema is the complete check.
--
-- Characters: species and background were closed lists of the 2024 ids. They become kebab-case ids, so a character can
-- use a species or a background of the library. Class stays closed (story 9.3 only lets the library override a class).

begin;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.rule_entries (
  ruleset    text        not null constraint rule_entries_ruleset_check check (ruleset in ('2014', '2024')),
  kind       text        not null
             constraint rule_entries_kind_check
             check (kind in ('species', 'subspecies', 'class', 'subclass', 'background', 'feat', 'spell', 'item')),
  id         text        not null
             constraint rule_entries_id_check
             check (char_length(id) between 3 and 60 and id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  content    jsonb       not null
             constraint rule_entries_content_object check (jsonb_typeof(content) = 'object')
             constraint rule_entries_content_size check (octet_length(content::text) <= 65536),
  revision   integer     not null default 1 constraint rule_entries_revision_check check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (ruleset, kind, id)
);

comment on table public.rule_entries is
  'DM rules library per edition (story 9.3). content: rule entry envelope, see docs/dnd-2024.md "Rule entries".';

-- ---------------------------------------------------------------------------
-- validate_rule_entry: structural guard of an entry. Returns null when the entry passes, else the first problem.
-- Pure (reads only its arguments): callable by the MCP before writing, used by the trigger below.
-- ---------------------------------------------------------------------------

create or replace function public.validate_rule_entry(p_kind text, p_content jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_body_keys text[];
  v_key text;
  v_text text;
begin
  if p_content is null or jsonb_typeof(p_content) <> 'object' then
    return 'content must be a JSON object';
  end if;
  if octet_length(p_content::text) > 65536 then
    return 'content is larger than 65536 bytes';
  end if;

  v_body_keys := case p_kind
    when 'species'    then array['size', 'speed', 'grants', 'lineages']
    when 'subspecies' then array['parent', 'grants']
    when 'class'      then array['primaryAbility', 'levels']
    when 'subclass'   then array['class', 'chosenAtClassLevel', 'features']
    when 'background' then array['grants']
    when 'feat'       then array['category', 'prerequisites', 'grants', 'repeatable']
    when 'spell'      then array['level', 'school', 'ritual', 'concentration', 'castingTime', 'range', 'duration',
                                 'components', 'classes']
    when 'item'       then array['grants', 'requiresAttunement']
  end;
  if v_body_keys is null then
    return format('unknown kind "%s"', p_kind);
  end if;

  -- Envelope
  select k into v_key from jsonb_object_keys(p_content) k
   where k <> all (array['schema', 'kind', 'id', 'name', 'source', 'summary', 'needsReview', 'body']) limit 1;
  if v_key is not null then
    return format('unknown key "%s" in the entry', v_key);
  end if;
  if p_content -> 'schema' is distinct from '1'::jsonb then
    return 'schema must be 1';
  end if;
  if p_content ->> 'kind' is distinct from p_kind or jsonb_typeof(p_content -> 'kind') is distinct from 'string' then
    return format('kind must be "%s"', p_kind);
  end if;
  if jsonb_typeof(p_content -> 'id') is distinct from 'string'
     or not (char_length(p_content ->> 'id') between 3 and 60 and (p_content ->> 'id') ~ '^[a-z0-9]+(-[a-z0-9]+)*$') then
    return 'id must be kebab-case, 3 to 60 characters';
  end if;

  if jsonb_typeof(p_content -> 'name') is distinct from 'object'
     or jsonb_typeof(p_content -> 'name' -> 'en') is distinct from 'string' then
    return 'name.en is required';
  end if;
  select k into v_key from jsonb_object_keys(p_content -> 'name') k where k not in ('en', 'fr') limit 1;
  if v_key is not null then
    return format('unknown key "%s" in name', v_key);
  end if;
  if p_content -> 'name' ? 'fr' and jsonb_typeof(p_content -> 'name' -> 'fr') <> 'string' then
    return 'name.fr must be a string';
  end if;
  if char_length(p_content -> 'name' ->> 'en') not between 1 and 120
     or char_length(coalesce(p_content -> 'name' ->> 'fr', 'x')) not between 1 and 120 then
    return 'a name has 1 to 120 characters';
  end if;

  if p_content ? 'summary' then
    if jsonb_typeof(p_content -> 'summary') <> 'object' then
      return 'summary must be an object';
    end if;
    select k into v_key from jsonb_object_keys(p_content -> 'summary') k where k not in ('en', 'fr') limit 1;
    if v_key is not null then
      return format('unknown key "%s" in summary', v_key);
    end if;
    if exists (select 1 from jsonb_each(p_content -> 'summary') e where jsonb_typeof(e.value) <> 'string') then
      return 'summary.en and summary.fr must be strings';
    end if;
  end if;

  if p_content ? 'source' then
    if jsonb_typeof(p_content -> 'source') <> 'object'
       or jsonb_typeof(p_content -> 'source' -> 'book') is distinct from 'string' then
      return 'source.book is required when source is given';
    end if;
    select k into v_key from jsonb_object_keys(p_content -> 'source') k where k not in ('book', 'page') limit 1;
    if v_key is not null then
      return format('unknown key "%s" in source', v_key);
    end if;
  end if;

  if p_content ? 'needsReview' then
    if jsonb_typeof(p_content -> 'needsReview') <> 'array' or jsonb_array_length(p_content -> 'needsReview') > 20 then
      return 'needsReview is a list of at most 20 notes';
    end if;
    if exists (select 1 from jsonb_array_elements(p_content -> 'needsReview') n
                where jsonb_typeof(n) <> 'string' or char_length(n #>> '{}') not between 1 and 200) then
      return 'a needsReview note is a string of 1 to 200 characters';
    end if;
  end if;

  -- Body
  if jsonb_typeof(p_content -> 'body') is distinct from 'object' then
    return 'body must be an object';
  end if;
  select k into v_key from jsonb_object_keys(p_content -> 'body') k where k <> all (v_body_keys) limit 1;
  if v_key is not null then
    return format('unknown key "%s" in the body of a %s', v_key, p_kind);
  end if;

  -- Every element of a `grants` list (at any depth) is an object whose `type` is one of the 29 Grant variants.
  -- The rest of each grant is checked by the Zod schema (write and read); this is the structural floor.
  if exists (
    select 1 from jsonb_path_query(p_content, 'lax $.**.grants[*]') g
     where jsonb_typeof(g) <> 'object'
        or jsonb_typeof(g -> 'type') is distinct from 'string'
        or (g ->> 'type') <> all (array[
             'ability-bonus', 'ability-choice', 'proficiency', 'proficiency-choice', 'skill-expertise',
             'expertise-choice', 'feature', 'speed', 'hit-die', 'hp-bonus', 'resistance', 'armor-class', 'ac-bonus',
             'spellcasting', 'spell', 'asi', 'subclass', 'ability-check-bonus', 'fighting-style-choice',
             'weapon-mastery-choice', 'damage-choice', 'equipment', 'bundle-choice', 'lineage-choice', 'feat-choice',
             'feature-choice', 'feat', 'resource-pool', 'spell-choice'])
  ) then
    return 'every grant is an object whose type is one of the 29 grant types';
  end if;

  -- Everywhere: keys are identifiers, strings are bounded plain text, arrays are bounded.
  select k into v_key
    from jsonb_path_query(p_content, 'strict $.** ? (@.type() == "object")') o(v),
         lateral jsonb_object_keys(o.v) k
   where not (k ~ '^[A-Za-z][A-Za-z0-9-]{0,59}$')
   limit 1;
  if v_key is not null then
    return format('invalid key "%s"', left(v_key, 60));
  end if;

  select s #>> '{}' into v_text
    from jsonb_path_query(p_content, 'strict $.** ? (@.type() == "string")') s
   where char_length(s #>> '{}') > 4000
      or (s #>> '{}') ~* '[<>]|javascript:|vbscript:|data:|http|^\s*(//|www\.)'
      -- Control and invisible formatting characters (line breaks excepted): they can hide a scheme or reorder text.
      or (s #>> '{}') ~ '[\u0001-\u0009\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB]'
   limit 1;
  if v_text is not null then
    if char_length(v_text) > 4000 then
      return 'a text is longer than 4000 characters';
    end if;
    if v_text ~ '[\u0001-\u0009\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB]' then
      return 'control and invisible formatting characters are not allowed in rule text';
    end if;
    return 'markup, links and scripts are not allowed in rule text (<, >, javascript:, vbscript:, data:, http, www., //)';
  end if;

  if jsonb_path_exists(p_content, 'strict $.** ? (@.type() == "array" && @.size() > 100)') then
    return 'a list has more than 100 elements';
  end if;

  return null;
end
$$;

revoke execute on function public.validate_rule_entry(text, jsonb) from public, anon;
grant execute on function public.validate_rule_entry(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- rule_entry_users: characters that use an entry id, WHATEVER the current edition of their campaign (a campaign can
-- change edition while it has drafts, and an id must not vanish under a character). `p_ruleset` is not used for the
-- characters; it names the entry for the API. Not SECURITY DEFINER: the DM reads every character, a player only sees
-- what they could read anyway. Used by the delete and review guards and by the MCP (9.4).
--
-- Limit (story 9.5 decides): a `subspecies` is matched through the `lineage-choice` decisions (`lineageId`), the only
-- place a sub-choice of a species is stored today. Lineage ids are not unique across species, so a subspecies id equal
-- to a lineage of another species also counts as used: safe, possibly over-cautious.
-- ---------------------------------------------------------------------------

create or replace function public.rule_entry_users(p_ruleset text, p_kind text, p_id text)
returns table (character_id uuid, name text)
language sql
stable
set search_path = ''
as $$
  select c.id, c.name
    from public.characters c
   where p_ruleset is not null
     and case p_kind
       when 'species' then c.species = p_id
       when 'background' then c.background = p_id
       when 'class' then c.class = p_id
         or exists (select 1 from public.character_build_levels b where b.character_id = c.id and b.class_id = p_id)
       when 'subclass' then c.subclass = p_id
         or exists (select 1 from public.character_build_levels b where b.character_id = c.id and b.subclass_id = p_id)
       when 'feat' then exists (
         select 1 from public.character_build_levels b
          where b.character_id = c.id
            and (b.feat_id = p_id
                 or jsonb_path_exists(b.choices, '$.* ? (@.type == "feat-choice" && @.featId == $id)',
                                      jsonb_build_object('id', p_id))))
       when 'spell' then exists (
         select 1 from public.character_build_levels b
          where b.character_id = c.id
            and jsonb_path_exists(b.choices, '$.*.spellIds[*] ? (@ == $id)', jsonb_build_object('id', p_id)))
       when 'subspecies' then exists (
         select 1 from public.character_build_levels b
          where b.character_id = c.id
            and jsonb_path_exists(b.choices, '$.* ? (@.type == "lineage-choice" && @.lineageId == $id)',
                                  jsonb_build_object('id', p_id)))
       when 'item' then exists (
         select 1 from public.character_items i where i.character_id = c.id and i.item_id = p_id)
       else false
     end
   order by c.name
$$;

revoke execute on function public.rule_entry_users(text, text, text) from public, anon;
grant execute on function public.rule_entry_users(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- rule_entry_references: other entries of the same edition whose content mentions the id (a subclass whose spell grant
-- names a library spell, a background granting a library feat...). Coarse on purpose: any string value equal to the id
-- counts. Not SECURITY DEFINER (only the DM reads the whole library).
-- ---------------------------------------------------------------------------

create or replace function public.rule_entry_references(p_ruleset text, p_kind text, p_id text)
returns table (kind text, id text)
language sql
stable
set search_path = ''
as $$
  select r.kind, r.id
    from public.rule_entries r
   where r.ruleset = p_ruleset
     and not (r.kind = p_kind and r.id = p_id)
     and jsonb_path_exists(r.content, 'strict $.** ? (@ == $id)', jsonb_build_object('id', p_id))
   order by r.kind, r.id
$$;

revoke execute on function public.rule_entry_references(text, text, text) from public, anon;
grant execute on function public.rule_entry_references(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Triggers: validation, quota, revision, identity, review notes on a used entry, delete guard
-- ---------------------------------------------------------------------------

create or replace function public.rule_entries_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_problem text;
  v_count integer;
  v_names text;
begin
  if tg_op = 'UPDATE' and (new.ruleset, new.kind, new.id) is distinct from (old.ruleset, old.kind, old.id) then
    raise exception 'The edition, kind and id of a rule entry can not change'
      using errcode = '23514', constraint = 'rule_entries_identity';
  end if;

  v_problem := public.validate_rule_entry(new.kind, new.content);
  if v_problem is not null then
    raise exception 'Invalid rule entry %:%: %', new.kind, new.id, v_problem
      using errcode = '23514', constraint = 'rule_entries_content_valid';
  end if;
  if new.content ->> 'id' is distinct from new.id then
    raise exception 'Invalid rule entry %:%: content.id must equal the row id', new.kind, new.id
      using errcode = '23514', constraint = 'rule_entries_content_valid';
  end if;

  if tg_op = 'INSERT' then
    -- Serialize the inserts of one (ruleset, kind) so two concurrent inserts can not both pass the quota.
    perform pg_advisory_xact_lock(hashtext('rule_entries:' || new.ruleset || ':' || new.kind));
    select count(*) into v_count from public.rule_entries where ruleset = new.ruleset and kind = new.kind;
    if v_count >= 2000 then
      raise exception 'The % library of the % rules is full (2000 entries)', new.kind, new.ruleset
        using errcode = '23514', constraint = 'rule_entries_quota';
    end if;
    new.revision := 1;
    new.created_at := now();
  else
    -- Review notes make an entry unusable: refused while a character uses it (same answer as a deletion).
    if jsonb_typeof(new.content -> 'needsReview') = 'array' and jsonb_array_length(new.content -> 'needsReview') > 0 then
      select count(*), string_agg(u.name, ', ' order by u.name)
        into v_count, v_names
        from public.rule_entry_users(new.ruleset, new.kind, new.id) u;
      if v_count > 0 then
        raise exception 'The rule entry %:% is used by % character(s): %', new.kind, new.id, v_count, left(v_names, 500)
          using errcode = '23503', constraint = 'rule_entries_in_use';
      end if;
    end if;
    new.revision := old.revision + 1;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end
$$;

revoke execute on function public.rule_entries_before_write() from public, anon, authenticated;

create trigger rule_entries_before_write
  before insert or update on public.rule_entries
  for each row execute function public.rule_entries_before_write();

create or replace function public.rule_entries_before_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_names text;
  v_count integer;
begin
  select count(*), string_agg(u.name, ', ' order by u.name)
    into v_count, v_names
    from public.rule_entry_users(old.ruleset, old.kind, old.id) u;
  if v_count > 0 then
    raise exception 'The rule entry %:% is used by % character(s): %', old.kind, old.id, v_count, left(v_names, 500)
      using errcode = '23503', constraint = 'rule_entries_in_use';
  end if;
  select count(*), string_agg(r.kind || ':' || r.id, ', ' order by r.kind, r.id)
    into v_count, v_names
    from public.rule_entry_references(old.ruleset, old.kind, old.id) r;
  if v_count > 0 then
    raise exception 'The rule entry %:% is referenced by % other entry(ies): %', old.kind, old.id, v_count, left(v_names, 500)
      using errcode = '23503', constraint = 'rule_entries_referenced';
  end if;
  return old;
end
$$;

revoke execute on function public.rule_entries_before_delete() from public, anon, authenticated;

create trigger rule_entries_before_delete
  before delete on public.rule_entries
  for each row execute function public.rule_entries_before_delete();

-- ---------------------------------------------------------------------------
-- Privileges and policies
-- ---------------------------------------------------------------------------

alter table public.rule_entries enable row level security;

revoke all on public.rule_entries from public, anon, authenticated;
grant select, delete on public.rule_entries to authenticated;
-- revision and the timestamps are the database's; the identity of an entry never changes after the insert.
grant insert (ruleset, kind, id, content) on public.rule_entries to authenticated;
grant update (content) on public.rule_entries to authenticated;

-- Members read the library of the editions of their campaigns (campaigns RLS applies inside the subquery).
create policy rule_entries_member_select on public.rule_entries
  for select to authenticated
  using (exists (select 1 from public.campaigns c where c.ruleset = rule_entries.ruleset and public.is_member(c.id)));

create policy rule_entries_dm_all on public.rule_entries
  for all to authenticated
  using (public.is_dm())
  with check (public.is_dm());

-- The active-user rule (AD-4): an archived or temporary-password account is out, whatever else says yes.
create policy access_active on public.rule_entries
  as restrictive for all to authenticated
  using (public.is_dm() or public.is_active_user());

-- ---------------------------------------------------------------------------
-- Characters may use a species or background of the library (kebab-case ids instead of the 2024 closed lists).
-- ---------------------------------------------------------------------------

alter table public.characters drop constraint characters_species_check;
alter table public.characters add constraint characters_species_check
  check (species is null or (char_length(species) between 3 and 60 and species ~ '^[a-z0-9]+(-[a-z0-9]+)*$'));

alter table public.characters drop constraint characters_background_check;
alter table public.characters add constraint characters_background_check
  check (background is null or (char_length(background) between 3 and 60 and background ~ '^[a-z0-9]+(-[a-z0-9]+)*$'));

commit;
