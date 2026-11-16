-- Story 1.8: data as it exists BEFORE the access-control migrations (open schema, up to 20260607000000).
-- Used only by scripts/cutover/test-cutover.sh, never applied by a migration or seed.
-- Everything the cutover must carry over is here with a recognisable value; assert-post-cutover.sql
-- checks each of them.
begin;

-- Two campaigns: one with DM notes, one without (NULL must survive as empty notes).
insert into campaigns (id, name, status, description, dm_notes) values
  ('c0ffee00-0000-4000-8000-000000000001', 'Curse of Strahd', 'active', 'Gothic horror', 'STRAHD IS THE BURGOMASTER''S SECRET FATHER'),
  ('c0ffee00-0000-4000-8000-000000000002', 'Lost Mine', 'planning', 'Starter set', null);

-- Characters: a PC with a legacy public portrait URL and free-text player_name, an NPC, a draft.
insert into characters (id, campaign_id, name, character_type, player_name, level, backstory, notes, portrait_url) values
  ('ca000000-0000-4000-8000-000000000001', 'c0ffee00-0000-4000-8000-000000000001', 'Aldric', 'pc', 'Marie (the real one)', 3,
   'ALDRIC BACKSTORY: orphan raised by monks', 'ALDRIC NOTES: afraid of fire',
   'http://127.0.0.1:54321/storage/v1/object/public/character-portraits/ca000000-0000-4000-8000-000000000001/portrait.jpg?v=2'),
  ('ca000000-0000-4000-8000-000000000002', 'c0ffee00-0000-4000-8000-000000000001', 'Ireena', 'npc', null, 1,
   null, 'IREENA NOTES: looks like Tatyana', null),
  ('ca000000-0000-4000-8000-000000000003', 'c0ffee00-0000-4000-8000-000000000002', 'Draft hero', 'pc', 'Paul', 0,
   'DRAFT BACKSTORY', null, 'https://example.com/not-ours.png');

insert into character_build_levels (character_id, sequence, class_id, class_level) values
  ('ca000000-0000-4000-8000-000000000001', 1, 'fighter', 1),
  ('ca000000-0000-4000-8000-000000000001', 2, 'fighter', 2);

insert into character_items (character_id, item_id, quantity, equipped) values
  ('ca000000-0000-4000-8000-000000000001', 'longsword', 1, true),
  ('ca000000-0000-4000-8000-000000000001', 'rope-hempen', 2, false);

-- Sessions with DM notes, loot (jsonb) and XP.
insert into sessions (id, campaign_id, session_number, name, summary, notes, loot, experience_awarded) values
  ('5e000000-0000-4000-8000-000000000001', 'c0ffee00-0000-4000-8000-000000000001', 1, 'Death House', 'The party explored a haunted house.',
   'SESSION 1 DM NOTES: the cult is in the basement', '[{"item": "silver dagger", "qty": 1}]'::jsonb, 300),
  ('5e000000-0000-4000-8000-000000000002', 'c0ffee00-0000-4000-8000-000000000001', 2, 'Village of Barovia', null,
   null, null, 450);

insert into encounters (id, campaign_id, name, status, round, notes) values
  ('e0000000-0000-4000-8000-000000000001', 'c0ffee00-0000-4000-8000-000000000001', 'Wolves at the gate', 'completed', 4, 'ENCOUNTER NOTES: use pack tactics');

insert into notes (id, campaign_id, title, content, category, tags, is_pinned) values
  ('b0000000-0000-4000-8000-000000000001', 'c0ffee00-0000-4000-8000-000000000001', 'Vallaki politics', 'NOTE CONTENT: the Baron is paranoid', 'lore', array['politics', 'vallaki'], true);

commit;
