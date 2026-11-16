-- Proves the test harness itself (story 1.1, AD-14): the seven identities, the
-- "blocked write touches 0 rows" rule, and the two "raises 42501" rules (refused
-- INSERT and refused UPDATE ... WITH CHECK), each with a positive control so a
-- 42501 caused by a missing GRANT cannot pass for a RLS refusal.
-- Uses a throwaway table inside the transaction; nothing is left behind.
begin;

select plan(18);

create table public.harness_probe (
  id    int primary key,
  owner uuid not null
);
alter table public.harness_probe enable row level security;
grant select, insert, update, delete on public.harness_probe to authenticated;

create policy probe_read on public.harness_probe
  for select to authenticated using (true);
create policy probe_insert on public.harness_probe
  for insert to authenticated with check (owner = auth.uid());
create policy probe_update on public.harness_probe
  for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy probe_delete on public.harness_probe
  for delete to authenticated using (owner = auth.uid());

insert into public.harness_probe values (1, tests.uid('owner'));

-- identities ---------------------------------------------------------------
-- They differ only by their UUID: their real status (archived, temporary
-- password, DM...) comes from the `profiles` rows each test inserts for them.
select tests.set_identity('owner');
select is(auth.uid(), tests.uid('owner'), 'owner identity sets auth.uid()');
select is(current_user::text, 'authenticated', 'owner runs as role authenticated');

select tests.set_identity('anon');
select is(current_user::text, 'anon', 'anon identity runs as role anon');
-- Supabase grants table privileges to anon by default (revoked in story 1.7), so
-- RLS is what protects the row: with no policy for anon it sees nothing.
select is(
  (select count(*) from public.harness_probe),
  0::bigint,
  'anon sees no row through RLS'
);

select tests.reset_identity();
select throws_ok(
  $q$select tests.set_identity('nobody')$q$,
  'P0001',
  'unknown test identity: nobody',
  'an unknown identity is rejected'
);

select is(
  (select count(distinct tests.uid(i)) from unnest(array[
    'owner', 'other_player', 'archived', 'temp_password', 'non_member', 'dm'
  ]) as i),
  6::bigint,
  'the six authenticated identities have distinct non-null UUIDs'
);

select tests.set_identity('owner');
select is(auth.uid(), tests.uid('owner'), 'set_identity owner');
select tests.set_identity('other_player');
select is(auth.uid(), tests.uid('other_player'), 'set_identity other_player');
select tests.set_identity('archived');
select is(auth.uid(), tests.uid('archived'), 'set_identity archived');
select tests.set_identity('temp_password');
select is(auth.uid(), tests.uid('temp_password'), 'set_identity temp_password');
select tests.set_identity('non_member');
select is(auth.uid(), tests.uid('non_member'), 'set_identity non_member');
select tests.set_identity('dm');
select is(auth.uid(), tests.uid('dm'), 'set_identity dm');

-- blocked writes touch 0 rows, without error ------------------------------------
select tests.set_identity('other_player');
select is(
  tests.rows_affected($q$update public.harness_probe set owner = owner where id = 1$q$),
  0::bigint,
  'UPDATE blocked by RLS touches 0 rows'
);
select is(
  tests.rows_affected($q$delete from public.harness_probe where id = 1$q$),
  0::bigint,
  'DELETE blocked by RLS touches 0 rows'
);

-- refused INSERT raises 42501 ------------------------------------------------------
select throws_ok(
  format('insert into public.harness_probe values (2, %L)', tests.uid('owner')),
  '42501',
  null,
  'INSERT refused by WITH CHECK raises 42501'
);

-- the owner can write (positive controls) ----------------------------------------
select tests.set_identity('owner');
select is(
  tests.rows_affected(format('insert into public.harness_probe values (3, %L)', tests.uid('owner'))),
  1::bigint,
  'the owner INSERT touches 1 row'
);
select is(
  tests.rows_affected($q$update public.harness_probe set owner = owner where id = 1$q$),
  1::bigint,
  'the owner UPDATE touches 1 row'
);

-- refused UPDATE ... WITH CHECK raises 42501 ---------------------------------------
select throws_ok(
  format('update public.harness_probe set owner = %L where id = 1', tests.uid('other_player')),
  '42501',
  null,
  'UPDATE whose new row fails WITH CHECK raises 42501'
);

select * from finish();
rollback;
