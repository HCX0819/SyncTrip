-- RLS guarantees from migration 005. Run with: supabase test db
-- Everything happens in one transaction that is rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

-- Fixtures (as postgres, bypassing RLS) -------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@test.dev'),
  ('22222222-2222-2222-2222-222222222222', 'outsider@test.dev');

insert into public.trips (id, name, destination, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Kyoto', 'Kyoto', '11111111-1111-1111-1111-111111111111');

insert into public.trip_members (trip_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner');

insert into public.saved_places (id, trip_id, added_by, title) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111', 'Fushimi Inari');

-- The outsider only ever learns the token through the invite link.
select set_config('test.token',
  (select invite_token from public.trips where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), true);

-- Act as the outsider --------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select is_empty(
  $$ select id from public.trips $$,
  'non-member cannot list trips'
);

select throws_ok(
  $$ insert into public.trip_members (trip_id, user_id, role)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'owner') $$,
  '42501', null,
  'non-member cannot insert themselves as owner'
);

select throws_ok(
  $$ insert into public.trip_members (trip_id, user_id, role)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'member') $$,
  '42501', null,
  'non-member cannot insert themselves as member'
);

select throws_ok(
  $$ insert into public.votes (place_id, user_id, value)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'yaay') $$,
  '42501', null,
  'non-member cannot vote'
);

select throws_ok(
  $$ select email from public.profiles $$,
  '42501', null,
  'profiles.email is not selectable'
);

select is_empty(
  $$ select id from public.profiles where id = '11111111-1111-1111-1111-111111111111' $$,
  'non-member cannot see the owner''s profile'
);

select is_empty(
  $$ select * from public.get_trip_invite_preview('not-a-real-token') $$,
  'invite preview with a wrong token returns nothing'
);

-- Join through the invite token ---------------------------------------------
select is(
  public.join_trip(current_setting('test.token')),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'join_trip with a valid token returns the trip id'
);

select is(
  (select role::text from public.trip_members
   where trip_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     and user_id = '22222222-2222-2222-2222-222222222222'),
  'member',
  'join_trip always grants the member role'
);

select isnt_empty(
  $$ select id from public.trips where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'after joining, the trip is visible'
);

select isnt_empty(
  $$ select id from public.profiles where id = '11111111-1111-1111-1111-111111111111' $$,
  'after joining, trip-mates'' profiles are visible'
);

select lives_ok(
  $$ insert into public.votes (place_id, user_id, value)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'yaay') $$,
  'after joining, the member can vote'
);

select throws_ok(
  $$ select email from public.profiles $$,
  '42501', null,
  'profiles.email stays hidden from trip-mates'
);

select * from finish();
rollback;
