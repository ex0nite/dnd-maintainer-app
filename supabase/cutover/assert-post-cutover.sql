-- Story 1.8: after the cutover every value of fixture-pre-lock.sql is still there, in its new home,
-- and nothing was invented. Any failed check raises an exception (run with ON_ERROR_STOP).
-- Runs as the database owner (RLS does not apply): this proves the DATA moved, the pgTAP matrix proves who may read it.
set plpgsql.check_asserts = on;

do $$
declare
  n integer;
  v text;
begin
  -- Counts are exactly those of the fixture (the seed's demo campaign is a third campaign).
  select count(*) into n from public.campaigns where id::text like 'c0ffee00-%';
  assert n = 2, format('campaigns: expected 2, got %s', n);
  select count(*) into n from public.characters where id::text like 'ca000000-%';
  assert n = 3, format('characters: expected 3, got %s', n);
  select count(*) into n from public.character_build_levels where character_id::text like 'ca000000-%';
  assert n = 2, format('character_build_levels: expected 2, got %s', n);
  select count(*) into n from public.character_items where character_id::text like 'ca000000-%';
  assert n = 2, format('character_items: expected 2, got %s', n);
  select count(*) into n from public.sessions where id::text like '5e000000-%';
  assert n = 2, format('sessions: expected 2, got %s', n);
  select count(*) into n from public.encounters where id::text like 'e0000000-%';
  assert n = 1, format('encounters: expected 1, got %s', n);
  select count(*) into n from public.notes where id::text like 'b0000000-%';
  assert n = 1, format('notes: expected 1, got %s', n);

  -- Campaign DM notes: moved to campaign_dm, NULL becomes empty text, column gone.
  select dm_notes into v from public.campaign_dm where campaign_id = 'c0ffee00-0000-4000-8000-000000000001';
  assert v = 'STRAHD IS THE BURGOMASTER''S SECRET FATHER', 'campaign_dm.dm_notes lost or altered';
  select dm_notes into v from public.campaign_dm where campaign_id = 'c0ffee00-0000-4000-8000-000000000002';
  assert v = '', 'a campaign without notes must get an empty campaign_dm row';
  assert not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'campaigns' and column_name = 'dm_notes'),
    'campaigns.dm_notes should be gone';
  select count(*) into n from public.campaign_dm;
  assert n = (select count(*) from public.campaigns), 'every campaign has exactly one campaign_dm row';

  -- Character private parts.
  select backstory into v from public.character_private where character_id = 'ca000000-0000-4000-8000-000000000001';
  assert v = 'ALDRIC BACKSTORY: orphan raised by monks', 'Aldric backstory lost';
  select notes into v from public.character_private where character_id = 'ca000000-0000-4000-8000-000000000001';
  assert v = 'ALDRIC NOTES: afraid of fire', 'Aldric notes lost';
  select notes into v from public.character_private where character_id = 'ca000000-0000-4000-8000-000000000002';
  assert v = 'IREENA NOTES: looks like Tatyana', 'Ireena notes lost';
  select backstory into v from public.character_private where character_id = 'ca000000-0000-4000-8000-000000000003';
  assert v = 'DRAFT BACKSTORY', 'draft backstory lost';
  select count(*) into n from public.character_private;
  assert n = (select count(*) from public.characters), 'every character has exactly one character_private row';

  -- NULLs stay NULL (no invented text) where the new column allows it.
  assert (select backstory from public.character_private where character_id = 'ca000000-0000-4000-8000-000000000002') is null, 'Ireena backstory should still be NULL';
  assert (select notes from public.character_private where character_id = 'ca000000-0000-4000-8000-000000000003') is null, 'draft notes should still be NULL';
  assert (select notes from public.session_dm where session_id = '5e000000-0000-4000-8000-000000000002') is null, 'session 2 notes should still be NULL';
  assert (select experience_awarded from public.session_dm where session_id = '5e000000-0000-4000-8000-000000000002') = 450, 'session 2 XP lost';
  assert (select loot from public.session_dm where session_id = '5e000000-0000-4000-8000-000000000002') is null, 'session 2 loot should still be NULL';

  -- Level history and inventory keep their values, not only their counts.
  assert (select array_agg(class_id || ':' || class_level order by sequence) from public.character_build_levels where character_id = 'ca000000-0000-4000-8000-000000000001') = array['fighter:1', 'fighter:2'], 'build levels altered';
  assert (select array_agg(item_id || ':' || quantity || ':' || equipped order by item_id) from public.character_items where character_id = 'ca000000-0000-4000-8000-000000000001') = array['longsword:1:true', 'rope-hempen:2:false'], 'inventory altered';

  -- Free-text player name untouched, no owner assigned (the DM does it later, story 3.9).
  select player_name into v from public.characters where id = 'ca000000-0000-4000-8000-000000000001';
  assert v = 'Marie (the real one)', 'player_name must stay free text';
  assert not exists (select 1 from public.characters where owner_user_id is not null), 'no character may get an owner automatically';
  assert not exists (select 1 from public.characters where archived_with_owner), 'archived_with_owner must start false';

  -- Portraits: the legacy public URL became the storage path, a foreign URL was cleared.
  select portrait_url into v from public.characters where id = 'ca000000-0000-4000-8000-000000000001';
  assert v = 'ca000000-0000-4000-8000-000000000001/portrait.jpg', format('portrait path wrong: %s', v);
  select portrait_url into v from public.characters where id = 'ca000000-0000-4000-8000-000000000003';
  assert v is null, 'a foreign portrait URL must be cleared';

  -- Sessions: notes, loot and XP moved without loss, totals unchanged.
  select notes into v from public.session_dm where session_id = '5e000000-0000-4000-8000-000000000001';
  assert v = 'SESSION 1 DM NOTES: the cult is in the basement', 'session notes lost';
  assert (select loot from public.session_dm where session_id = '5e000000-0000-4000-8000-000000000001') = '[{"item": "silver dagger", "qty": 1}]'::jsonb,
    'session loot lost or altered';
  select coalesce(sum(experience_awarded), 0) into n from public.session_dm where session_id::text like '5e000000-%';
  assert n = 750, format('total XP expected 750, got %s', n);
  select count(*) into n from public.session_dm;
  assert n = (select count(*) from public.sessions), 'every session has exactly one session_dm row';
  assert not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'sessions' and column_name in ('notes', 'loot', 'experience_awarded')),
    'private session columns should be gone';
  assert not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'characters' and column_name in ('backstory', 'notes')),
    'private character columns should be gone';

  -- Untouched content.
  select summary into v from public.sessions where id = '5e000000-0000-4000-8000-000000000001';
  assert v = 'The party explored a haunted house.', 'session summary altered';
  select notes into v from public.encounters where id = 'e0000000-0000-4000-8000-000000000001';
  assert v = 'ENCOUNTER NOTES: use pack tactics', 'encounter notes altered';
  select content into v from public.notes where id = 'b0000000-0000-4000-8000-000000000001';
  assert v = 'NOTE CONTENT: the Baron is paranoid', 'DM note altered';

  -- The lock is in place.
  assert not exists (select 1 from pg_policies where schemaname in ('public', 'storage') and (qual = 'true' or with_check = 'true')),
    'an open policy survived the cutover';
  assert (select count(*) from storage.buckets where public) = 0, 'a public bucket survived the cutover';
end
$$;

select 'cutover data check: OK' as result;
