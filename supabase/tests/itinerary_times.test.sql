-- Itinerary times and trip travel mode from migration 010. Run with: supabase test db
-- Everything happens in one transaction that is rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

-- Fixtures (as postgres, bypassing RLS) -------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@test.dev'),
  ('22222222-2222-2222-2222-222222222222', 'outsider@test.dev'),
  ('33333333-3333-3333-3333-333333333333', 'member@test.dev');

insert into public.trips (id, name, destination, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Kyoto', 'Kyoto', '11111111-1111-1111-1111-111111111111');

insert into public.trip_members (trip_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'member');

insert into public.saved_places (id, trip_id, added_by, title) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111', 'Fushimi Inari');

insert into public.itinerary_items (id, trip_id, place_id, day_index, sort_order) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1, 1);

select is(
  (select travel_mode from public.trips where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'walk',
  'travel_mode defaults to walk'
);

-- Act as the (non-owner) member ----------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';

select lives_ok(
  $$ update public.itinerary_items
     set start_time = '09:00', end_time = '10:30'
     where id = 'cccccccc-0000-0000-0000-000000000001' $$,
  'member can set item times'
);

select results_eq(
  $$ select start_time, end_time from public.itinerary_items
     where id = 'cccccccc-0000-0000-0000-000000000001' $$,
  $$ values ('09:00'::time, '10:30'::time) $$,
  'item times are saved'
);

select throws_ok(
  $$ update public.itinerary_items
     set start_time = '11:00', end_time = '10:00'
     where id = 'cccccccc-0000-0000-0000-000000000001' $$,
  '23514', null,
  'end_time must be after start_time'
);

select lives_ok(
  $$ update public.itinerary_items
     set start_time = '14:00', end_time = null
     where id = 'cccccccc-0000-0000-0000-000000000001' $$,
  'a start time alone is allowed'
);

-- Trip updates are owner-only (migration 006), so this matches no rows.
update public.trips set travel_mode = 'drive'
where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- Act as the owner -----------------------------------------------------------
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select is(
  (select travel_mode from public.trips where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'walk',
  'non-owner members cannot change travel_mode'
);

select lives_ok(
  $$ update public.trips set travel_mode = 'drive'
     where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'owner can update travel_mode (column grant)'
);

select throws_ok(
  $$ update public.trips set travel_mode = 'fly'
     where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '23514', null,
  'travel_mode only accepts walk or drive'
);

-- Act as the outsider --------------------------------------------------------
set local request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

update public.itinerary_items set start_time = '06:00', end_time = '07:00'
where id = 'cccccccc-0000-0000-0000-000000000001';

reset role;

select results_eq(
  $$ select start_time, end_time from public.itinerary_items
     where id = 'cccccccc-0000-0000-0000-000000000001' $$,
  $$ values ('14:00'::time, null::time) $$,
  'non-member cannot change item times'
);

select is(
  (select travel_mode from public.trips where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'drive',
  'owner travel_mode change persisted'
);

-- set_travel_mode() lets any member change it.
set local role authenticated;
set local request.jwt.claims = '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';

select lives_ok(
  $$ select public.set_travel_mode('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'walk') $$,
  'member can set travel_mode through set_travel_mode()'
);

select is(
  (select travel_mode from public.trips where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'walk',
  'member travel_mode change persisted'
);

set local request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select throws_ok(
  $$ select public.set_travel_mode('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'drive') $$,
  '42501', null,
  'non-member cannot set travel_mode'
);

select * from finish();
rollback;
