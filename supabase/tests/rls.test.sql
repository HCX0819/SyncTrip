-- RLS guarantees from migrations 005 and 006. Run with: supabase test db
-- Everything happens in one transaction that is rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;

select plan(30);

-- Fixtures (as postgres, bypassing RLS) -------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@test.dev'),
  ('22222222-2222-2222-2222-222222222222', 'outsider@test.dev'),
  ('33333333-3333-3333-3333-333333333333', 'first-member@test.dev'),
  ('44444444-4444-4444-4444-444444444444', 'second-member@test.dev');

insert into public.trips (id, name, destination, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Kyoto', 'Kyoto', '11111111-1111-1111-1111-111111111111');

insert into public.trip_members (trip_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner');

-- Trip management fixtures (006). joined_at is explicit because now() is
-- constant inside the transaction and ownership passes to the earliest joiner.
insert into public.trips (id, name, destination, created_by) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Lisbon', 'Lisbon', '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Solo', 'Oslo', '33333333-3333-3333-3333-333333333333');

insert into public.trip_members (trip_id, user_id, role, joined_at) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111', 'owner',  '2026-01-01'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '33333333-3333-3333-3333-333333333333', 'member', '2026-01-02'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '44444444-4444-4444-4444-444444444444', 'member', '2026-01-03'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '33333333-3333-3333-3333-333333333333', 'owner',  '2026-01-01');

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

-- Trip management (006) ------------------------------------------------------
-- Act as a plain member of Lisbon.
set local request.jwt.claims = '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';

-- RLS silently filters these to zero rows, so check the outcome afterwards.
update public.trips set name = 'Hacked' where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
select is(
  (select name from public.trips where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  'Lisbon',
  'member cannot rename the trip'
);

delete from public.trips where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
select isnt_empty(
  $$ select id from public.trips where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' $$,
  'member cannot delete the trip'
);

select throws_ok(
  $$ select public.remove_member('cccccccc-cccc-cccc-cccc-cccccccccccc', '44444444-4444-4444-4444-444444444444') $$,
  'P0001', 'Only the trip owner can remove members',
  'member cannot remove other members'
);

select throws_ok(
  $$ select public.remove_trip_member_internal('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111') $$,
  '42501', null,
  'the internal leave helper is not callable by clients'
);

select throws_ok(
  $$ update public.trips set created_by = '33333333-3333-3333-3333-333333333333'
     where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' $$,
  '42501', null,
  'trips.created_by is not client-writable'
);

-- Act as the owner of Lisbon.
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

update public.trips set name = 'Lisboa' where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
select is(
  (select name from public.trips where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  'Lisboa',
  'owner can rename the trip'
);

select throws_ok(
  $$ select public.remove_member('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111') $$,
  'P0001', null,
  'owner cannot remove themselves'
);

select is(
  public.leave_trip('cccccccc-cccc-cccc-cccc-cccccccccccc'),
  'transferred',
  'owner leaving hands the trip over'
);

select is_empty(
  $$ select id from public.trips where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' $$,
  'former owner (and creator) can no longer see the trip'
);

-- Act as the earliest remaining member.
set local request.jwt.claims = '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';

select is(
  (select role::text from public.trip_members
   where trip_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
     and user_id = '33333333-3333-3333-3333-333333333333'),
  'owner',
  'earliest-joined member becomes owner'
);

select is(
  (select role::text from public.trip_members
   where trip_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
     and user_id = '44444444-4444-4444-4444-444444444444'),
  'member',
  'later members keep the member role'
);

select lives_ok(
  $$ select public.remove_member('cccccccc-cccc-cccc-cccc-cccccccccccc', '44444444-4444-4444-4444-444444444444') $$,
  'new owner can remove a member'
);

select is(
  public.leave_trip('dddddddd-dddd-dddd-dddd-dddddddddddd'),
  'deleted',
  'last member leaving reports the trip as deleted'
);

-- The new owner deletes Lisbon; checked below as postgres.
delete from public.trips where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

-- Act as the removed member.
set local request.jwt.claims = '{"sub": "44444444-4444-4444-4444-444444444444", "role": "authenticated"}';

select throws_ok(
  $$ select public.leave_trip('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
  'P0001', 'Not a member of this trip',
  'leave_trip rejects non-members'
);

-- Verify deletions as postgres, bypassing RLS.
reset role;

select is_empty(
  $$ select id from public.trips where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' $$,
  'last member leaving deletes the trip'
);

select is_empty(
  $$ select id from public.trips where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' $$,
  'owner can delete the trip'
);

select is_empty(
  $$ select id from public.trip_members where trip_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' $$,
  'deleting a trip cascades to its members'
);

select * from finish();
rollback;
