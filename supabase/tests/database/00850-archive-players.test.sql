-- Story 2.5 (D-30): archive_player / reactivate_player, and what an archived player can still see.
begin;

select plan(21);

insert into auth.users (id, email)
select tests.uid(i), i || '@table.invalid'
from unnest(array['owner', 'other_player', 'dm']) as i;

insert into public.profiles (user_id, pseudo, role, must_change_password)
values (tests.uid('dm'), 'maitre', 'dm', false),
       (tests.uid('owner'), 'alice', 'player', false),
       (tests.uid('other_player'), 'bob', 'player', false);

insert into public.campaigns (id, name, description)
values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Campaign A', 'a'),
       ('bbbbbbbb-0000-4000-8000-00000000000b', 'Campaign B', 'b');
insert into public.campaign_members (campaign_id, user_id)
values ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('owner')),
       ('aaaaaaaa-0000-4000-8000-00000000000a', tests.uid('other_player'));

insert into public.characters (id, campaign_id, name, character_type, owner_user_id, is_active)
values ('c1000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Alice active', 'pc', tests.uid('owner'), true),
       ('c1000000-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Alice disabled by hand', 'pc', tests.uid('owner'), false),
       ('c2000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Bob active', 'pc', tests.uid('other_player'), true);
insert into public.sessions (id, campaign_id, session_number)
values ('52000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', 1);
insert into auth.sessions (id, user_id)
values ('a0000000-0000-4000-8000-000000000001', tests.uid('owner')),
       ('a0000000-0000-4000-8000-000000000002', tests.uid('other_player'));

-- Privileges ---------------------------------------------------------------------------------------------------------
select ok(
  has_function_privilege('service_role', 'public.archive_player(uuid)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.reactivate_player(uuid)', 'EXECUTE'),
  'service_role can archive and reactivate'
);
select ok(
  not has_function_privilege('authenticated', 'public.archive_player(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.archive_player(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.reactivate_player(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.reactivate_player(uuid)', 'EXECUTE'),
  'nobody signed in (not even the DM through the API) can call them'
);
select tests.set_identity('dm');
select throws_ok(
  format('select public.archive_player(%L)', tests.uid('owner')),
  '42501', null, 'the DM session itself goes through the service, not the API'
);
select tests.reset_identity();

-- Refusals -----------------------------------------------------------------------------------------------------------
select throws_ok(
  format('select public.archive_player(%L)', tests.uid('dm')),
  '42501', 'only a player account can be archived', 'the DM account cannot be archived'
);
select throws_ok(
  format('select public.reactivate_player(%L)', tests.uid('dm')),
  '42501', 'only a player account can be reactivated', 'nor reactivated'
);
select throws_ok(
  $$select public.archive_player('99999999-9999-4999-8999-999999999999')$$,
  'P0002', 'unknown account', 'an unknown account is refused'
);

-- Before: the player sees their campaign.
select tests.set_identity('owner');
select is((select count(*)::int from public.campaigns), 1, 'before archiving the player sees their campaign');
select tests.reset_identity();

-- Archive ------------------------------------------------------------------------------------------------------------
select lives_ok(format('select public.archive_player(%L)', tests.uid('owner')), 'archiving works');
select isnt(
  (select archived_at from public.profiles where user_id = tests.uid('owner')), null,
  'the profile is stamped'
);
select is(
  (select count(*)::int from auth.sessions where user_id = tests.uid('owner')), 0,
  'their sessions are gone'
);
select is(
  (select count(*)::int from auth.sessions where user_id = tests.uid('other_player')), 1,
  'other players keep their sessions'
);
select is(
  (select array_agg(is_active::text || '/' || archived_with_owner::text order by name)
     from public.characters where owner_user_id = tests.uid('owner')),
  array['false/true', 'false/false'],
  'their active character is disabled and marked; the hand-disabled one is left alone'
);
select is(
  (select is_active from public.characters where owner_user_id = tests.uid('other_player')), true,
  'another player''s character is untouched'
);

-- The archived player reads nothing, with the very same identity (token still valid).
select tests.set_identity('owner');
select is((select count(*)::int from public.campaigns), 0, 'an archived player sees no campaign');
select is((select count(*)::int from public.characters), 0, 'nor character');
select is((select count(*)::int from public.sessions), 0, 'nor session');
select tests.reset_identity();

select lives_ok(
  format('select public.archive_player(%L)', tests.uid('owner')),
  'archiving twice is accepted (retry after a failed authentication-side step)'
);

-- Reactivate ---------------------------------------------------------------------------------------------------------
select lives_ok(format('select public.reactivate_player(%L)', tests.uid('owner')), 'reactivating works');
select is(
  (select array_agg(is_active::text || '/' || archived_with_owner::text order by name)
     from public.characters where owner_user_id = tests.uid('owner')),
  array['true/false', 'false/false'],
  'only the character archived with the owner comes back; the hand-disabled one stays disabled'
);
select tests.set_identity('owner');
select is((select count(*)::int from public.campaigns), 1, 'the reactivated player sees their campaign again');
select tests.reset_identity();
select is(
  (select archived_at from public.profiles where user_id = tests.uid('owner')), null,
  'the stamp is cleared'
);

select * from finish();
rollback;
