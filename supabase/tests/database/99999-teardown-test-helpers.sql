-- Removes the helpers installed by 00000-setup-test-helpers.sql so the test
-- database is left clean (nothing in schema `tests` can leak into a later
-- `supabase db diff`). pg_prove runs every file even after a failure.
drop schema if exists tests cascade;

select plan(1);
select hasnt_schema('tests', 'test helpers removed');
select * from finish();
