-- Story 9.4: every refusal of the rule_entries guards carries the name of the guard in HINT (PostgREST passes the hint
-- to API clients such as the MCP, not the constraint name). throws_ok does not see the hint: the helper below runs the
-- statement and returns "<sqlstate> <hint>" read with get stacked diagnostics. Run as the table owner (no RLS): the
-- access matrix is covered by 00560. Every entry below is invented (no book text).
begin;

select plan(7);

create function pg_temp.refusal_of(p_sql text) returns text
language plpgsql as $$
declare
  v_state text;
  v_hint text;
begin
  execute p_sql;
  return 'no error';
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint;
  return v_state || ' ' || coalesce(v_hint, '');
end
$$;

insert into public.campaigns (id, name, ruleset) values ('cccccccc-0000-4000-8000-00000000000c', 'Campaign C', '2024');
insert into public.rule_entries (ruleset, kind, id, content)
values ('2024', 'species', 'hint-folk',
        '{"schema":1,"kind":"species","id":"hint-folk","name":{"en":"Hint Folk"},"body":{"size":"medium","speed":30,"grants":[]}}'),
       ('2024', 'feat', 'hint-knack',
        '{"schema":1,"kind":"feat","id":"hint-knack","name":{"en":"Hint Knack"},
          "body":{"category":"origin","prerequisites":[],"grants":[]}}'),
       ('2024', 'background', 'hint-past',
        '{"schema":1,"kind":"background","id":"hint-past","name":{"en":"Hint Past"},
          "body":{"grants":[{"type":"feat","featId":"hint-knack"}]}}');
insert into public.characters (campaign_id, name, character_type, class, species)
values ('cccccccc-0000-4000-8000-00000000000c', 'Hinted', 'pc', 'fighter', 'hint-folk');

select is(
  pg_temp.refusal_of($$insert into public.rule_entries (ruleset, kind, id, content) values ('2024', 'feat', 'hint-bad',
    '{"schema":1,"kind":"feat","id":"hint-bad","name":{"en":"see http x"},"body":{"category":"origin","prerequisites":[],"grants":[]}}')$$),
  '23514 rule_entries_content_valid', 'invalid content: hint rule_entries_content_valid');
select is(
  pg_temp.refusal_of($$insert into public.rule_entries (ruleset, kind, id, content) values ('2024', 'feat', 'hint-other',
    '{"schema":1,"kind":"feat","id":"hint-knack","name":{"en":"Mismatch"},"body":{"category":"origin","prerequisites":[],"grants":[]}}')$$),
  '23514 rule_entries_content_valid', 'content.id differs from the row id: hint rule_entries_content_valid');
select is(
  pg_temp.refusal_of($$update public.rule_entries set id = 'hint-moved' where id = 'hint-knack'$$),
  '23514 rule_entries_identity', 'identity change: hint rule_entries_identity');
select is(
  pg_temp.refusal_of($$update public.rule_entries set content = jsonb_set(content, '{needsReview}', '["check"]')
    where kind = 'species' and id = 'hint-folk'$$),
  '23503 rule_entries_in_use', 'review notes on a used entry: hint rule_entries_in_use');
select is(
  pg_temp.refusal_of($$delete from public.rule_entries where kind = 'species' and id = 'hint-folk'$$),
  '23503 rule_entries_in_use', 'delete of a used entry: hint rule_entries_in_use');
select is(
  pg_temp.refusal_of($$delete from public.rule_entries where kind = 'feat' and id = 'hint-knack'$$),
  '23503 rule_entries_referenced', 'delete of a referenced entry: hint rule_entries_referenced');

-- Quota: fill the 2014 item library to 2000 entries, the next one is refused.
insert into public.rule_entries (ruleset, kind, id, content)
select '2014', 'item', 'hint-item-' || n,
       jsonb_build_object('schema', 1, 'kind', 'item', 'id', 'hint-item-' || n, 'name', jsonb_build_object('en', 'Item ' || n),
                          'body', jsonb_build_object('grants', '[]'::jsonb, 'requiresAttunement', false))
from generate_series(1, 2000 - (select count(*) from public.rule_entries where ruleset = '2014' and kind = 'item')) n;
select is(
  pg_temp.refusal_of($$insert into public.rule_entries (ruleset, kind, id, content) values ('2014', 'item', 'hint-item-extra',
    '{"schema":1,"kind":"item","id":"hint-item-extra","name":{"en":"Extra"},"body":{"grants":[],"requiresAttunement":false}}')$$),
  '23514 rule_entries_quota', 'full library: hint rule_entries_quota');

select * from finish();
rollback;
