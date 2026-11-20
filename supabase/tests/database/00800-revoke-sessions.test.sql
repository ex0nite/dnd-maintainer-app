-- Story 2.4 (AD-2): public.revoke_user_sessions(uuid) is for account-admin (service_role) only.
begin;

select plan(7);

insert into auth.users (id, email)
values (tests.uid('owner'), 'alice@table.invalid'),
       (tests.uid('other_player'), 'bob@table.invalid');

insert into auth.sessions (id, user_id)
values ('a0000000-0000-4000-8000-000000000001', tests.uid('owner')),
       ('a0000000-0000-4000-8000-000000000002', tests.uid('owner')),
       ('a0000000-0000-4000-8000-000000000003', tests.uid('other_player'));

select ok(
  has_function_privilege('service_role', 'public.revoke_user_sessions(uuid)', 'EXECUTE'),
  'service_role can execute revoke_user_sessions'
);
select ok(
  not has_function_privilege('authenticated', 'public.revoke_user_sessions(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.revoke_user_sessions(uuid)', 'EXECUTE')
  and not has_function_privilege('public', 'public.revoke_user_sessions(uuid)', 'EXECUTE'),
  'neither signed-in users, anon nor PUBLIC can execute it'
);

select tests.set_identity('owner');
select throws_ok(
  format('select public.revoke_user_sessions(%L)', tests.uid('other_player')),
  '42501', null, 'a signed-in player cannot end someone else''s sessions'
);
select throws_ok(
  format('select public.revoke_user_sessions(%L)', tests.uid('owner')),
  '42501', null, 'nor their own through the API'
);
select tests.reset_identity();

select lives_ok(
  format('select public.revoke_user_sessions(%L)', tests.uid('owner')),
  'the privileged caller can revoke'
);
select is(
  (select count(*)::int from auth.sessions where user_id = tests.uid('owner')), 0,
  'every session of the target is gone'
);
select is(
  (select count(*)::int from auth.sessions where user_id = tests.uid('other_player')), 1,
  'other users keep their sessions'
);

select * from finish();
rollback;
