-- Structure checks (AD-1, AD-4, AD-14, story 1.7). They run on the database as built by ALL migrations
-- and fail as soon as someone adds a table, a policy or a grant that re-opens the door:
--   * a table of `public` without row-level security
--   * a table without the restrictive `access_active` policy (profiles is the documented exception:
--     a user must read their own profile to learn they must change their password)
--   * an open policy (`true`), or a policy that applies to anon / PUBLIC, in `public` or `storage`
--   * a privilege of anon on a table, sequence or function of `public`
--   * a view that is not `security_invoker`
--   * a public bucket
begin;

select plan(14);

select is(
  (select array_agg(c.relname::text order by c.relname)
     from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity),
  null,
  'every table of public has row-level security enabled'
);

select is(
  (select array_agg(c.relname::text order by c.relname)
     from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and c.relname <> 'profiles'
      and not exists (
        select 1 from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname
           and p.policyname = 'access_active' and p.permissive = 'RESTRICTIVE'
           and p.roles = '{authenticated}' and p.cmd = 'ALL'
           and p.qual = '(is_dm() OR is_active_user())')),
  null,
  'every table of public (except profiles) carries the restrictive access_active policy'
);

select is(
  (select array_agg(p.schemaname || '.' || p.tablename || ':' || p.policyname order by p.tablename, p.policyname)
     from pg_policies p
    where p.schemaname in ('public', 'storage') and (p.qual = 'true' or p.with_check = 'true')),
  null,
  'no open (true) policy in public or storage'
);

select is(
  (select array_agg(p.schemaname || '.' || p.tablename || ':' || p.policyname order by p.tablename, p.policyname)
     from pg_policies p
    where p.schemaname in ('public', 'storage') 
      and (p.roles && array['public'::name, 'anon'::name])),
  null,
  'no policy applies to anon or PUBLIC'
);

select is(
  (select array_agg(c.relname::text order by c.relname)
     from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
      and (has_table_privilege('authenticated', c.oid, 'TRUNCATE')
           or has_table_privilege('authenticated', c.oid, 'REFERENCES')
           or has_table_privilege('authenticated', c.oid, 'TRIGGER'))),
  null,
  'authenticated holds no TRUNCATE (it bypasses RLS), REFERENCES or TRIGGER on any table of public'
);

select is(
  (select array_agg(c.relname::text order by c.relname)
     from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'S')
      and (has_any_column_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')
           or (c.relkind = 'S' and (has_sequence_privilege('anon', c.oid, 'USAGE, SELECT, UPDATE')
                                    or has_sequence_privilege('public', c.oid, 'USAGE, SELECT, UPDATE'))))),
  null,
  'anon holds no column or sequence privilege in public'
);

-- A SECURITY DEFINER function of public is callable as an RPC by any signed-in user and bypasses both the
-- RLS and access_active: each one must be reviewed and listed here.
select is(
  (select array_agg(p.proname::text order by p.proname)
     from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosecdef
      and p.proname not in ('is_dm', 'is_active_user', 'is_member', 'owns_character', 'owns_active_character', 'can_read_character', 'portrait_object_count')
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  null,
  'no unreviewed SECURITY DEFINER function is executable by authenticated'
);

select is(
  (select array_agg(c.relname::text order by c.relname)
     from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'S')
      and (has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
           or has_table_privilege('public', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'))),
  null,
  'anon and PUBLIC hold no privilege on any table, view or sequence of public'
);

select is(
  (select array_agg(p.proname::text order by p.proname)
     from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('public', p.oid, 'EXECUTE'))),
  null,
  'anon and PUBLIC can execute no function of public'
);

select is(
  (select array_agg(c.relname::text order by c.relname)
     from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
      and not coalesce(c.reloptions @> array['security_invoker=true'], false)),
  null,
  'every view of public is security_invoker'
);

select is(
  (select array_agg(b.id order by b.id) from storage.buckets b where b.public),
  null,
  'no storage bucket is public'
);

select is(
  (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass)
  and exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                and policyname = 'access_active' and permissive = 'RESTRICTIVE'
                and roles = '{authenticated}' and cmd = 'ALL' and qual = '(is_dm() OR is_active_user())'),
  true,
  'storage.objects has RLS and the exact restrictive access_active policy'
);

select is(
  (select array_agg(c.relname::text order by c.relname)
     from pg_class c
    where c.relnamespace = 'storage'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity),
  null,
  'every table of the storage schema has row-level security enabled'
);

select is(
  (select array_agg(p.tablename::text || ':' || p.policyname order by p.tablename, p.policyname)
     from pg_policies p
    where p.schemaname = 'storage' and p.tablename <> 'objects'),
  null,
  'no policy on the other storage tables (buckets, prefixes, multipart uploads): they stay closed to API roles'
);

select * from finish();
rollback;
