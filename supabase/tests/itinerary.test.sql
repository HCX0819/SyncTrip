-- reorder_itinerary_day() from migration 007. Run with: supabase test db
-- Everything happens in one transaction that is rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

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

-- Day 1: c1, c2, c3 in that order. Day 2: c4.
insert into public.itinerary_items (id, trip_id, place_id, day_index, sort_order) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1, 1),
  ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1, 2),
  ('cccccccc-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1, 3),
  ('cccccccc-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 2, 1);

-- Act as the member -----------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select lives_ok(
  $$ select public.reorder_itinerary_day(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1,
       array['cccccccc-0000-0000-0000-000000000003',
             'cccccccc-0000-0000-0000-000000000001',
             'cccccccc-0000-0000-0000-000000000002']::uuid[]) $$,
  'member can reorder a day'
);

select results_eq(
  $$ select id from public.itinerary_items
     where trip_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and day_index = 1
     order by sort_order $$,
  $$ values ('cccccccc-0000-0000-0000-000000000003'::uuid),
            ('cccccccc-0000-0000-0000-000000000001'::uuid),
            ('cccccccc-0000-0000-0000-000000000002'::uuid) $$,
  'new order is applied'
);

select results_eq(
  $$ select sort_order from public.itinerary_items
     where trip_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and day_index = 1
     order by sort_order $$,
  $$ values (1), (2), (3) $$,
  'sort_order matches array position'
);

-- Move c1 to the end of day 2.
select lives_ok(
  $$ select public.reorder_itinerary_day(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2,
       array['cccccccc-0000-0000-0000-000000000004',
             'cccccccc-0000-0000-0000-000000000001']::uuid[]) $$,
  'member can move an item to another day'
);

select results_eq(
  $$ select day_index, sort_order from public.itinerary_items
     where id = 'cccccccc-0000-0000-0000-000000000001' $$,
  $$ values (2, 2) $$,
  'moved item has the new day_index and position'
);

select is(
  (select count(*)::int from public.itinerary_items
   where trip_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and day_index = 1),
  2,
  'source day no longer contains the moved item'
);

-- Act as the outsider --------------------------------------------------------
set local request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select throws_ok(
  $$ select public.reorder_itinerary_day(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1,
       array['cccccccc-0000-0000-0000-000000000002']::uuid[]) $$,
  '42501', null,
  'non-member cannot reorder'
);

select * from finish();
rollback;
