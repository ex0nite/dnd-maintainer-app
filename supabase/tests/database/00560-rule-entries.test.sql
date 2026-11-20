-- Story 9.3: rule_entries, the DM's rules library per edition, 7 identities (AD-14), and its guards:
--   validate_rule_entry (structure, markup, bounds), size, quota, revision, identity, delete refused while in use,
--   rule_entry_users, and the relaxed species / background checks of characters.
-- Every entry below is invented (no book text).
begin;

select plan(104);

insert into auth.users (id, email)
select tests.uid(i), i || '@table.invalid'
from unnest(array['owner', 'other_player', 'archived', 'temp_password', 'non_member', 'dm']) as i;

insert into public.profiles (user_id, pseudo, role, must_change_password, archived_at)
values (tests.uid('dm'), 'maitre', 'dm', false, null),
       (tests.uid('owner'), 'alice', 'player', false, null),
       (tests.uid('other_player'), 'bob', 'player', false, null),
       (tests.uid('archived'), 'carol', 'player', false, now()),
       (tests.uid('temp_password'), 'dave', 'player', true, null),
       (tests.uid('non_member'), 'erin', 'player', false, null);

-- A follows 2024 (owner, archived, temp_password), B follows 2014 (other_player). non_member is in none.
insert into public.campaigns (id, name, ruleset)
values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Campaign A', '2024'),
       ('bbbbbbbb-0000-4000-8000-00000000000b', 'Campaign B', '2014');
insert into public.campaign_members (campaign_id, user_id)
values ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('owner')),
       ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('archived')),
       ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('temp_password')),
       ('bbbbbbbb-0000-4000-8000-00000000000b', tests.uid('other_player'));

-- One entry per edition.
insert into public.rule_entries (ruleset, kind, id, content)
values ('2024', 'subclass', 'test-circle',
        '{"schema":1,"kind":"subclass","id":"test-circle","name":{"en":"Circle of Testing","fr":"Cercle du Test"},
          "body":{"class":"druid","chosenAtClassLevel":3,"features":[{"classLevel":3,"grants":[
            {"type":"feature","feature":{"id":"test-circle-gift","name":"Gift of Tests"}}]}]}}'),
       ('2014', 'species', 'test-folk',
        '{"schema":1,"kind":"species","id":"test-folk","name":{"en":"Test Folk"},
          "body":{"size":"medium","speed":30,"grants":[]}}');

-- Structure -----------------------------------------------------------------------------------------------------------
select policies_are('public', 'rule_entries', array['rule_entries_member_select', 'rule_entries_dm_all', 'access_active'],
  'rule_entries: member read, DM write, active-user rule');
select ok(not has_table_privilege('anon', 'public.rule_entries', 'SELECT, INSERT, UPDATE, DELETE'),
  'anon holds no privilege on rule_entries');
select ok(
  has_function_privilege('authenticated', 'public.validate_rule_entry(text, jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.validate_rule_entry(text, jsonb)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.rule_entry_users(text, text, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.rule_entry_users(text, text, text)', 'EXECUTE'),
  'validate_rule_entry and rule_entry_users: authenticated only');
select ok(
  not has_function_privilege('authenticated', 'public.rule_entries_before_write()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.rule_entries_before_delete()', 'EXECUTE')
  and not (select prosecdef from pg_proc where proname = 'rule_entry_users' and pronamespace = 'public'::regnamespace),
  'trigger functions are not callable, rule_entry_users is not SECURITY DEFINER');

-- anon ----------------------------------------------------------------------------------------------------------------
select tests.set_identity('anon');
select throws_ok($$select * from public.rule_entries$$, '42501', null, 'anon: read refused');
select throws_ok(
  $$insert into public.rule_entries (ruleset, kind, id, content) values ('2024', 'feat', 'anon-feat', '{}')$$,
  '42501', null, 'anon: insert refused');
select throws_ok($$update public.rule_entries set content = content$$, '42501', null, 'anon: update refused');
select throws_ok($$delete from public.rule_entries$$, '42501', null, 'anon: delete refused');
select tests.reset_identity();

-- owner (member of the 2024 campaign) ----------------------------------------------------------------------------------
select tests.set_identity('owner');
select is((select count(*)::int from public.rule_entries), 1, 'owner: reads the library of the 2024 edition only');
select is((select id from public.rule_entries), 'test-circle', 'owner: the 2024 entry, not the 2014 one');
select throws_ok(
  $$insert into public.rule_entries (ruleset, kind, id, content) values ('2024', 'feat', 'owner-feat',
    '{"schema":1,"kind":"feat","id":"owner-feat","name":{"en":"Owner Feat"},"body":{"category":"general","prerequisites":[],"grants":[]}}')$$,
  '42501', null, 'owner: insert refused');
select is(tests.rows_affected($$update public.rule_entries set content = content$$)::int, 0, 'owner: update touches 0 rows');
select is(tests.rows_affected($$delete from public.rule_entries$$)::int, 0, 'owner: delete touches 0 rows');
select tests.reset_identity();

-- other_player (member of the 2014 campaign) ---------------------------------------------------------------------------
select tests.set_identity('other_player');
select is((select array_agg(id) from public.rule_entries), array['test-folk'], 'other_player: reads the 2014 library only');
select throws_ok(
  $$insert into public.rule_entries (ruleset, kind, id, content) values ('2014', 'feat', 'bob-feat',
    '{"schema":1,"kind":"feat","id":"bob-feat","name":{"en":"Feat"},"body":{"category":"general","prerequisites":[],"grants":[]}}')$$,
  '42501', null, 'other_player: insert refused');
select is(tests.rows_affected($$update public.rule_entries set content = content$$)::int, 0, 'other_player: update touches 0 rows');
select is(tests.rows_affected($$delete from public.rule_entries$$)::int, 0, 'other_player: delete touches 0 rows');
select tests.reset_identity();

-- archived, temp_password, non_member ------------------------------------------------------------------------------------
select tests.set_identity('archived');
select is((select count(*)::int from public.rule_entries), 0, 'archived: reads nothing');
select throws_ok(
  $$insert into public.rule_entries (ruleset, kind, id, content) values ('2024', 'feat', 'carol-feat',
    '{"schema":1,"kind":"feat","id":"carol-feat","name":{"en":"Feat"},"body":{"category":"general","prerequisites":[],"grants":[]}}')$$,
  '42501', null, 'archived: insert refused');
select is(tests.rows_affected($$update public.rule_entries set content = content$$)::int, 0, 'archived: update touches 0 rows');
select is(tests.rows_affected($$delete from public.rule_entries$$)::int, 0, 'archived: delete touches 0 rows');
select tests.reset_identity();

select tests.set_identity('temp_password');
select is((select count(*)::int from public.rule_entries), 0, 'temp_password: reads nothing');
select throws_ok(
  $$insert into public.rule_entries (ruleset, kind, id, content) values ('2024', 'feat', 'dave-feat',
    '{"schema":1,"kind":"feat","id":"dave-feat","name":{"en":"Feat"},"body":{"category":"general","prerequisites":[],"grants":[]}}')$$,
  '42501', null, 'temp_password: insert refused');
select is(tests.rows_affected($$update public.rule_entries set content = content$$)::int, 0, 'temp_password: update touches 0 rows');
select is(tests.rows_affected($$delete from public.rule_entries$$)::int, 0, 'temp_password: delete touches 0 rows');
select tests.reset_identity();

select tests.set_identity('non_member');
select is((select count(*)::int from public.rule_entries), 0, 'non_member: reads nothing');
select throws_ok(
  $$insert into public.rule_entries (ruleset, kind, id, content) values ('2024', 'feat', 'erin-feat',
    '{"schema":1,"kind":"feat","id":"erin-feat","name":{"en":"Feat"},"body":{"category":"general","prerequisites":[],"grants":[]}}')$$,
  '42501', null, 'non_member: insert refused');
select is(tests.rows_affected($$update public.rule_entries set content = content$$)::int, 0, 'non_member: update touches 0 rows');
select is(tests.rows_affected($$delete from public.rule_entries$$)::int, 0, 'non_member: delete touches 0 rows');
select tests.reset_identity();

-- dm: reads and writes both editions, revision ---------------------------------------------------------------------------
select tests.set_identity('dm');
select is((select count(*)::int from public.rule_entries), 2, 'dm: reads both libraries');
select lives_ok(
  $$insert into public.rule_entries (ruleset, kind, id, content) values ('2024', 'feat', 'test-knack',
    '{"schema":1,"kind":"feat","id":"test-knack","name":{"en":"Test Knack","fr":"Talent de test"},
      "summary":{"en":"An invented feat used by the tests."},"source":{"book":"homebrew","page":3},
      "body":{"category":"general","prerequisites":[],"grants":[{"type":"ability-bonus","ability":"wis","bonus":1}]}}')$$,
  'dm: inserts a valid entry');
select is((select revision from public.rule_entries where id = 'test-knack'), 1, 'dm: a new entry is at revision 1');
select is(
  tests.rows_affected($$update public.rule_entries set content = jsonb_set(content, '{name,en}', '"Test Knack II"') where id = 'test-knack'$$)::int,
  1, 'dm: updates an entry');
select lives_ok($$update public.rule_entries set content = content where id = 'test-knack'$$, 'dm: updates it again');
select is((select revision from public.rule_entries where id = 'test-knack'), 3, 'dm: revision increments on every update');
select ok((select updated_at >= created_at from public.rule_entries where id = 'test-knack'), 'dm: updated_at is maintained');
select throws_ok($$update public.rule_entries set revision = 1 where id = 'test-knack'$$, '42501', null,
  'dm: revision is not writable through the API');
select throws_ok($$update public.rule_entries set id = 'other-knack' where id = 'test-knack'$$, '42501', null,
  'dm: the id of an entry can not change');
select throws_ok(
  $$insert into public.rule_entries (ruleset, kind, id, content, revision) values ('2024', 'feat', 'forged-rev',
    '{"schema":1,"kind":"feat","id":"forged-rev","name":{"en":"Forged"},"body":{"category":"general","prerequisites":[],"grants":[]}}', 9)$$,
  '42501', null, 'dm: revision can not be set at insert');
select is(tests.rows_affected($$delete from public.rule_entries where id = 'test-knack'$$)::int, 1, 'dm: deletes an unused entry');

-- Guards: what the table refuses, even from the DM --------------------------------------------------------------------
select throws_ok(
  $$insert into public.rule_entries (ruleset, kind, id, content) values ('2024', 'feat', 'not-object', '[]')$$,
  '23514', null, 'content must be a JSON object');
select throws_ok(
  $$insert into public.rule_entries (ruleset, kind, id, content) values ('2024', 'feat', 'evil-feat',
    '{"schema":1,"kind":"feat","id":"evil-feat","name":{"en":"<script>alert(1)</script>"},"body":{"category":"general","prerequisites":[],"grants":[]}}')$$,
  '23514', null, 'markup in a name is refused');
select throws_ok(
  $$insert into public.rule_entries (ruleset, kind, id, content) values ('2024', 'feat', 'row-id',
    '{"schema":1,"kind":"feat","id":"other-id","name":{"en":"Mismatch"},"body":{"category":"general","prerequisites":[],"grants":[]}}')$$,
  '23514', null, 'content.id must equal the row id');
select throws_ok(
  $$insert into public.rule_entries (ruleset, kind, id, content) values ('2024', 'feat', 'Bad_Id',
    '{"schema":1,"kind":"feat","id":"Bad_Id","name":{"en":"Bad"},"body":{"category":"general","prerequisites":[],"grants":[]}}')$$,
  '23514', null, 'a non kebab-case id is refused');
select throws_ok(
  $$insert into public.rule_entries (ruleset, kind, id, content) values ('2024', 'potion', 'some-potion', '{}')$$,
  '23514', null, 'an unknown kind is refused');
select throws_ok(
  $$insert into public.rule_entries (ruleset, kind, id, content) values ('2020', 'feat', 'old-feat', '{}')$$,
  '23514', null, 'an unknown edition is refused');
select throws_ok(
  $$update public.rule_entries set content = jsonb_set(content, '{body,extra}', '1') where id = 'test-circle'$$,
  '23514', null, 'an update is validated too');
select tests.reset_identity();

-- validate_rule_entry, rule by rule ----------------------------------------------------------------------------------------
select is(public.validate_rule_entry('species',
  '{"schema":1,"kind":"species","id":"test-folk","name":{"en":"Test Folk"},"body":{"size":"medium","speed":30,"grants":[]}}'),
  null, 'validate: a valid entry passes');
select is(public.validate_rule_entry('species',
  '{"schema":1,"kind":"species","id":"test-folk","name":{"en":"Test Folk"},"body":{"size":"medium","speed":30,"grants":[]},"script":"x"}'),
  'unknown key "script" in the entry', 'validate: unknown envelope key');
select is(public.validate_rule_entry('species',
  '{"schema":1,"kind":"species","id":"test-folk","name":{"en":"Test Folk"},"body":{"size":"medium","speed":30,"grants":[],"hp":9}}'),
  'unknown key "hp" in the body of a species', 'validate: unknown body key');
select is(public.validate_rule_entry('species',
  '{"schema":2,"kind":"species","id":"test-folk","name":{"en":"Test Folk"},"body":{}}'),
  'schema must be 1', 'validate: unknown schema version');
select is(public.validate_rule_entry('feat',
  '{"schema":1,"kind":"species","id":"test-folk","name":{"en":"Test Folk"},"body":{}}'),
  'kind must be "feat"', 'validate: kind of the content must match');
select is(public.validate_rule_entry('species',
  '{"schema":1,"kind":"species","id":"test-folk","name":{"fr":"Gens"},"body":{}}'),
  'name.en is required', 'validate: an English name is required');
select is(public.validate_rule_entry('species',
  '{"schema":1,"kind":"species","id":"test-folk","name":{"en":"Folk","de":"Leute"},"body":{}}'),
  'unknown key "de" in name', 'validate: only en and fr names');
select is(public.validate_rule_entry('species', jsonb_build_object('schema', 1, 'kind', 'species', 'id', 'test-folk',
    'name', jsonb_build_object('en', 'Folk'), 'body', jsonb_build_object('size', 'a > b'))),
  'markup, links and scripts are not allowed in rule text (<, >, javascript:, vbscript:, data:, http, www., //)', 'validate: ">" refused');
select is(public.validate_rule_entry('species', jsonb_build_object('schema', 1, 'kind', 'species', 'id', 'test-folk',
    'name', jsonb_build_object('en', 'JavaScript:void(0)'), 'body', '{}'::jsonb)),
  'markup, links and scripts are not allowed in rule text (<, >, javascript:, vbscript:, data:, http, www., //)', 'validate: javascript: refused (any case)');
select is(public.validate_rule_entry('species', jsonb_build_object('schema', 1, 'kind', 'species', 'id', 'test-folk',
    'name', jsonb_build_object('en', 'Folk'), 'summary', jsonb_build_object('en', 'see data:text/html,x'), 'body', '{}'::jsonb)),
  'markup, links and scripts are not allowed in rule text (<, >, javascript:, vbscript:, data:, http, www., //)', 'validate: data: refused');
select is(public.validate_rule_entry('species', jsonb_build_object('schema', 1, 'kind', 'species', 'id', 'test-folk',
    'name', jsonb_build_object('en', 'Folk'), 'needsReview', jsonb_build_array('check https://example.invalid'), 'body', '{}'::jsonb)),
  'markup, links and scripts are not allowed in rule text (<, >, javascript:, vbscript:, data:, http, www., //)', 'validate: links refused, review notes included');
select is(public.validate_rule_entry('species', jsonb_build_object('schema', 1, 'kind', 'species', 'id', 'test-folk',
    'name', jsonb_build_object('en', 'Folk'), 'summary', jsonb_build_object('en', repeat('a', 4001)), 'body', '{}'::jsonb)),
  'a text is longer than 4000 characters', 'validate: a text over 4000 characters');
select is(public.validate_rule_entry('species', jsonb_build_object('schema', 1, 'kind', 'species', 'id', 'test-folk',
    'name', jsonb_build_object('en', 'Folk'),
    'body', jsonb_build_object('grants', (select jsonb_agg(jsonb_build_object('type', 'hp-bonus', 'perLevel', 1)) from generate_series(1, 101))))),
  'a list has more than 100 elements', 'validate: a list over 100 elements');
select is(public.validate_rule_entry('species', jsonb_build_object('schema', 1, 'kind', 'species', 'id', 'test-folk',
    'name', jsonb_build_object('en', 'Folk'), 'needsReview', (select jsonb_agg('note'::text) from generate_series(1, 21)), 'body', '{}'::jsonb)),
  'needsReview is a list of at most 20 notes', 'validate: at most 20 review notes');
select is(public.validate_rule_entry('species', jsonb_build_object('schema', 1, 'kind', 'species', 'id', 'test-folk',
    'name', jsonb_build_object('en', 'Folk'), 'body', jsonb_build_object('size', repeat('a', 3000), 'speed', repeat('b', 3000),
      'grants', (select jsonb_agg(repeat('c', 3000)) from generate_series(1, 20))))),
  'content is larger than 65536 bytes', 'validate: content over 65536 bytes');
select is(public.validate_rule_entry('species', jsonb_build_object('schema', 1, 'kind', 'species', 'id', 'test-folk',
    'name', jsonb_build_object('en', 'Folk'), 'body', jsonb_build_object('grants', jsonb_build_array(jsonb_build_object('type', 'hp-bonus', 'bad key', 1))))),
  'invalid key "bad key"', 'validate: keys are identifiers');

-- The SQL is a structural floor: grant types are checked, the rest of a grant is Zod's job (write and read).
select is(public.validate_rule_entry('background', jsonb_build_object('schema', 1, 'kind', 'background', 'id', 'test-bg',
    'name', jsonb_build_object('en', 'Bg'), 'body', jsonb_build_object('grants', jsonb_build_array(jsonb_build_object('type', 'teleport'))))),
  'every grant is an object whose type is one of the 29 grant types', 'validate: an unknown grant type is refused');
select is(public.validate_rule_entry('subclass', jsonb_build_object('schema', 1, 'kind', 'subclass', 'id', 'test-sc',
    'name', jsonb_build_object('en', 'Sc'), 'body', jsonb_build_object('features', jsonb_build_array(jsonb_build_object('classLevel', 3,
      'grants', jsonb_build_array(jsonb_build_object('type', 'feature-choice', 'options', jsonb_build_array(jsonb_build_object(
        'grants', jsonb_build_array(jsonb_build_object('type', 'nope'))))))))))),
  'every grant is an object whose type is one of the 29 grant types', 'validate: grant types are checked at any depth');
select is(public.validate_rule_entry('background', jsonb_build_object('schema', 1, 'kind', 'background', 'id', 'test-bg',
    'name', jsonb_build_object('en', 'Bg'), 'body', jsonb_build_object('grants', jsonb_build_array(jsonb_build_object('type', 'hp-bonus', 'perLevel', 1, 'extra', 2))))),
  null, 'validate: an unknown key inside a grant passes the SQL floor (Zod refuses it on write and ignores the entry on read)');
select is(public.validate_rule_entry('species', jsonb_build_object('schema', 1, 'kind', 'species', 'id', 'test-folk',
    'name', jsonb_build_object('en', 'Folk', 'fr', 3), 'body', '{}'::jsonb)),
  'name.fr must be a string', 'validate: name.fr is a string');
select is(public.validate_rule_entry('species', jsonb_build_object('schema', 1, 'kind', 'species', 'id', 'test-folk',
    'name', jsonb_build_object('en', 'Folk'), 'summary', jsonb_build_object('en', jsonb_build_array('x')), 'body', '{}'::jsonb)),
  'summary.en and summary.fr must be strings', 'validate: summary texts are strings');
select is(public.validate_rule_entry('species', jsonb_build_object('schema', 1, 'kind', 'species', 'id', 'test-folk',
    'name', jsonb_build_object('en', 'Folk'), 'body', jsonb_build_object('grants', jsonb_build_array(jsonb_build_object('type', 'feature',
      'feature', jsonb_build_object('id', 'x', 'description', 'deep <img src=x>')))))),
  'markup, links and scripts are not allowed in rule text (<, >, javascript:, vbscript:, data:, http, www., //)',
  'validate: markup is found at any depth');
select is(public.validate_rule_entry('species', jsonb_build_object('schema', 1, 'kind', 'species', 'id', 'test-folk',
    'name', jsonb_build_object('en', 'see HtTpS now'), 'body', '{}'::jsonb)),
  'markup, links and scripts are not allowed in rule text (<, >, javascript:, vbscript:, data:, http, www., //)',
  'validate: HTTP in any case');
select is(public.validate_rule_entry('species', jsonb_build_object('schema', 1, 'kind', 'species', 'id', 'test-folk',
    'name', jsonb_build_object('en', 'VBScript:msgbox'), 'body', '{}'::jsonb)),
  'markup, links and scripts are not allowed in rule text (<, >, javascript:, vbscript:, data:, http, www., //)',
  'validate: vbscript: refused');
select is(public.validate_rule_entry('species', jsonb_build_object('schema', 1, 'kind', 'species', 'id', 'test-folk',
    'name', jsonb_build_object('en', 'Folk'), 'summary', jsonb_build_object('en', '  www.example.invalid'), 'body', '{}'::jsonb)),
  'markup, links and scripts are not allowed in rule text (<, >, javascript:, vbscript:, data:, http, www., //)',
  'validate: a value starting with www. refused');
select is(public.validate_rule_entry('species', jsonb_build_object('schema', 1, 'kind', 'species', 'id', 'test-folk',
    'name', jsonb_build_object('en', '//example.invalid'), 'body', '{}'::jsonb)),
  'markup, links and scripts are not allowed in rule text (<, >, javascript:, vbscript:, data:, http, www., //)',
  'validate: a value starting with // refused');
select is(public.validate_rule_entry('species', jsonb_build_object('schema', 1, 'kind', 'species', 'id', 'test-folk',
    'name', jsonb_build_object('en', 'java' || chr(9) || 'script:x'), 'body', '{}'::jsonb)),
  'control and invisible formatting characters are not allowed in rule text', 'validate: a tab (java<tab>script:) refused');
select is(public.validate_rule_entry('species', jsonb_build_object('schema', 1, 'kind', 'species', 'id', 'test-folk',
    'name', jsonb_build_object('en', 'Fo' || chr(8203) || 'lk'), 'body', '{}'::jsonb)),
  'control and invisible formatting characters are not allowed in rule text', 'validate: a zero-width space refused');
select is(public.validate_rule_entry('species', jsonb_build_object('schema', 1, 'kind', 'species', 'id', 'test-folk',
    'name', jsonb_build_object('en', 'Folk'), 'summary', jsonb_build_object('en', 'Line one' || chr(10) || 'line two'), 'body', '{}'::jsonb)),
  null, 'validate: a line break is allowed');

-- Quota: 2000 entries per (ruleset, kind) ------------------------------------------------------------------------------------
insert into public.rule_entries (ruleset, kind, id, content)
select '2014', 'item', 'quota-item-' || n,
       jsonb_build_object('schema', 1, 'kind', 'item', 'id', 'quota-item-' || n, 'name', jsonb_build_object('en', 'Quota item'),
                          'body', jsonb_build_object('grants', '[]'::jsonb, 'requiresAttunement', false))
from generate_series(1, 2000) n;
select tests.set_identity('dm');
select throws_ok(
  $$insert into public.rule_entries (ruleset, kind, id, content) values ('2014', 'item', 'one-too-many',
    '{"schema":1,"kind":"item","id":"one-too-many","name":{"en":"Too many"},"body":{"grants":[],"requiresAttunement":false}}')$$,
  '23514', null, 'the 2001st entry of a kind and edition is refused');
select lives_ok(
  $$insert into public.rule_entries (ruleset, kind, id, content) values ('2024', 'item', 'one-too-many',
    '{"schema":1,"kind":"item","id":"one-too-many","name":{"en":"Not too many"},"body":{"grants":[],"requiresAttunement":false}}')$$,
  'the quota counts per edition');
select throws_ok($$update public.rule_entries set kind = 'feat' where id = 'one-too-many'$$, '42501', null,
  'dm: the kind of an entry can not change');
select throws_ok($$update public.rule_entries set ruleset = '2014' where id = 'one-too-many' and ruleset = '2024'$$, '42501', null,
  'dm: the edition of an entry can not change');
select tests.reset_identity();

-- A DM who must change their password is not the DM until they do (is_dm() and access_active).
update public.profiles set must_change_password = true where user_id = tests.uid('dm');
select tests.set_identity('dm');
select is((select count(*)::int from public.rule_entries), 0, 'dm with a temporary password: reads nothing');
select throws_ok(
  $$insert into public.rule_entries (ruleset, kind, id, content) values ('2024', 'feat', 'temp-feat',
    '{"schema":1,"kind":"feat","id":"temp-feat","name":{"en":"Temp"},"body":{"category":"general","prerequisites":[],"grants":[]}}')$$,
  '42501', null, 'dm with a temporary password: insert refused');
select tests.reset_identity();
update public.profiles set must_change_password = false where user_id = tests.uid('dm');

-- Characters may use library entries; an entry in use can not be deleted ------------------------------------------------------
insert into public.rule_entries (ruleset, kind, id, content)
values ('2024', 'species', 'test-elfkin',
        '{"schema":1,"kind":"species","id":"test-elfkin","name":{"en":"Elfkin"},"body":{"size":"small","speed":25,"grants":[]}}'),
       ('2024', 'background', 'test-hermitage',
        '{"schema":1,"kind":"background","id":"test-hermitage","name":{"en":"Hermitage"},"body":{"grants":[]}}'),
       ('2024', 'feat', 'test-grit',
        '{"schema":1,"kind":"feat","id":"test-grit","name":{"en":"Grit"},"body":{"category":"origin","prerequisites":[],"grants":[]}}'),
       ('2024', 'feat', 'test-level-feat',
        '{"schema":1,"kind":"feat","id":"test-level-feat","name":{"en":"Level feat"},"body":{"category":"general","prerequisites":[],"grants":[]}}'),
       ('2024', 'subclass', 'test-row-circle',
        '{"schema":1,"kind":"subclass","id":"test-row-circle","name":{"en":"Row circle"},"body":{"class":"wizard","chosenAtClassLevel":3,"features":[]}}'),
       ('2024', 'class', 'wizard',
        '{"schema":1,"kind":"class","id":"wizard","name":{"en":"Table wizard"},"body":{"primaryAbility":"int","levels":[{"grants":[]}]}}'),
       ('2024', 'subspecies', 'test-dusk',
        '{"schema":1,"kind":"subspecies","id":"test-dusk","name":{"en":"Dusk kin"},"body":{"parent":"test-elfkin","grants":[]}}'),
       ('2024', 'spell', 'test-spark',
        '{"schema":1,"kind":"spell","id":"test-spark","name":{"en":"Spark"},"body":{"level":0,"school":"evocation","ritual":false,
          "concentration":false,"castingTime":"1 action","range":"30 feet","duration":"Instantaneous",
          "components":{"verbal":true,"somatic":false,"material":false},"classes":["wizard"]}}'),
       ('2024', 'species', 'test-folk',
        '{"schema":1,"kind":"species","id":"test-folk","name":{"en":"Test Folk (2024)"},"body":{"size":"medium","speed":30,"grants":[]}}'),
       ('2024', 'feat', 'test-ref-feat',
        '{"schema":1,"kind":"feat","id":"test-ref-feat","name":{"en":"Referenced"},"body":{"category":"origin","prerequisites":[],"grants":[]}}'),
       ('2024', 'background', 'test-ref-bg',
        '{"schema":1,"kind":"background","id":"test-ref-bg","name":{"en":"Referrer"},"body":{"grants":[{"type":"feat","featId":"test-ref-feat"}]}}'),
       ('2024', 'feat', 'test-unused',
        '{"schema":1,"kind":"feat","id":"test-unused","name":{"en":"Unused"},"body":{"category":"origin","prerequisites":[],"grants":[]}}');

select lives_ok(
  $$insert into public.characters (id, campaign_id, name, character_type, owner_user_id, species, background, subclass)
    values ('c4000000-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Alice elfkin', 'pc',
            tests.uid('owner'), 'test-elfkin', 'test-hermitage', 'test-circle')$$,
  'a character can use a library species and background');
select throws_ok(
  $$insert into public.characters (campaign_id, name, character_type, species) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Bad', 'npc', 'Not An Id')$$,
  '23514', null, 'characters.species stays a kebab-case id');
select throws_ok(
  $$insert into public.characters (campaign_id, name, character_type, background) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Bad', 'npc', '<b>x</b>')$$,
  '23514', null, 'characters.background stays a kebab-case id');
insert into public.character_build_levels (character_id, sequence, class_id, class_level, subclass_id, feat_id, choices)
values ('c4000000-0000-4000-8000-000000000004', 0, null, null, null, null,
        '{"feat-choice:species:test-elfkin:0":{"type":"feat-choice","featId":"test-grit"},
          "lineage-choice:species:test-elfkin:0":{"type":"lineage-choice","lineageId":"test-dusk"}}'),
       ('c4000000-0000-4000-8000-000000000004', 1, 'wizard', 1, 'test-row-circle', 'test-level-feat',
        '{"spell-choice:class:wizard:0":{"type":"spell-choice","spellIds":["test-spark"]}}');
insert into public.character_items (character_id, item_id) values ('c4000000-0000-4000-8000-000000000004', 'one-too-many');
-- A character of the 2014 campaign carrying the id of a 2024 entry: still blocks (its campaign may change edition).
insert into public.characters (campaign_id, name, character_type, species)
values ('bbbbbbbb-0000-4000-8000-00000000000b', 'Bob folk', 'pc', 'test-folk');

select tests.set_identity('dm');
select is((select array_agg(name) from public.rule_entry_users('2024', 'species', 'test-elfkin')), array['Alice elfkin'],
  'rule_entry_users lists the characters using an entry');
select throws_ok($$delete from public.rule_entries where ruleset = '2024' and kind = 'species' and id = 'test-elfkin'$$,
  '23503', null, 'a species in use can not be deleted');
select throws_ok($$delete from public.rule_entries where ruleset = '2024' and kind = 'background' and id = 'test-hermitage'$$,
  '23503', null, 'a background in use can not be deleted');
select throws_ok($$delete from public.rule_entries where ruleset = '2024' and kind = 'subclass' and id = 'test-circle'$$,
  '23503', null, 'a subclass in use (characters.subclass) can not be deleted');
select throws_ok($$delete from public.rule_entries where ruleset = '2024' and kind = 'subclass' and id = 'test-row-circle'$$,
  '23503', null, 'a subclass in use (build row subclass_id) can not be deleted');
select throws_ok($$delete from public.rule_entries where ruleset = '2024' and kind = 'class' and id = 'wizard'$$,
  '23503', null, 'a class in use (build row class_id) can not be deleted');
select throws_ok($$delete from public.rule_entries where ruleset = '2024' and kind = 'feat' and id = 'test-grit'$$,
  '23503', null, 'a feat chosen in a build can not be deleted');
select throws_ok($$delete from public.rule_entries where ruleset = '2024' and kind = 'feat' and id = 'test-level-feat'$$,
  '23503', null, 'a feat taken at a level (feat_id) can not be deleted');
select throws_ok($$delete from public.rule_entries where ruleset = '2024' and kind = 'subspecies' and id = 'test-dusk'$$,
  '23503', null, 'a subspecies chosen as a lineage can not be deleted');
select throws_ok($$delete from public.rule_entries where ruleset = '2024' and kind = 'spell' and id = 'test-spark'$$,
  '23503', null, 'a spell chosen in a build can not be deleted');
select throws_ok($$delete from public.rule_entries where ruleset = '2024' and kind = 'item' and id = 'one-too-many'$$,
  '23503', null, 'an item in an inventory can not be deleted');
select throws_ok($$delete from public.rule_entries where ruleset = '2024' and kind = 'species' and id = 'test-folk'$$,
  '23503', null, 'a character of a campaign of the other edition blocks the deletion too');
select is((select array_agg(kind || ':' || id) from public.rule_entry_references('2024', 'feat', 'test-ref-feat')),
  array['background:test-ref-bg'], 'rule_entry_references lists the entries that name an id');
select throws_ok($$delete from public.rule_entries where ruleset = '2024' and kind = 'feat' and id = 'test-ref-feat'$$,
  '23503', null, 'an entry named by another entry can not be deleted');
select lives_ok($$update public.rule_entries set content = jsonb_set(content, '{body,speed}', '30') where id = 'test-elfkin'$$,
  'an entry in use can still be updated');
select throws_ok(
  $$update public.rule_entries set content = jsonb_set(content, '{needsReview}', '["speed to confirm"]') where id = 'test-elfkin'$$,
  '23503', null, 'review notes can not be added to an entry in use');
select lives_ok(
  $$update public.rule_entries set content = jsonb_set(content, '{needsReview}', '["to confirm"]') where id = 'test-unused'$$,
  'review notes can be added to an unused entry');
select is(tests.rows_affected($$delete from public.rule_entries where id = 'test-unused'$$)::int, 1, 'an unused entry is deleted');
select tests.reset_identity();

select tests.set_identity('owner');
select is((select count(*)::int from public.rule_entry_users('2024', 'species', 'test-folk')), 0,
  'owner: rule_entry_users shows nothing they can not read');
select tests.reset_identity();

select * from finish();
rollback;
