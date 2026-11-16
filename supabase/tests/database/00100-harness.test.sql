-- Proves the test harness itself (story 1.1, AD-14): identities, the "blocked
-- write touches 0 rows" rule and the "refused INSERT raises 42501" rule.
-- Uses a throwaway table inside the transaction; nothing is left behind.
begin;

select plan(9);

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

-- the owner can write ------------------------------------------------------------------
select tests.set_identity('owner');
select is(
  tests.rows_affected($q$update public.harness_probe set owner = owner where id = 1$q$),
  1::bigint,
  'the owner UPDATE touches 1 row'
);

select * from finish();
rollback;
