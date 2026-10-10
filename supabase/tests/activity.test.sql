-- Activity feed from migration 008. Run with: supabase test db
-- Everything happens in one transaction that is rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

-- Fixtures (as postgres, bypassing RLS) -------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@test.dev'),
  ('22222222-2222-2222-2222-222222222222', 'outsider@test.dev'),
  ('33333333-3333-3333-3333-333333333333', 'member@test.dev');

insert into public.trips (id, name, destination, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Kyoto', 'Kyoto', '11111111-1111-1111-1111-111111111111');

-- now() is constant inside the transaction, so last_seen is set in the past
-- for events created below to count as unread.
insert into public.trip_members (trip_id, user_id, role, last_seen_activity_at) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner',  '2026-01-01'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'member', '2026-01-01');

-- The member fixture above logs a member_joined event; start from an empty feed.
delete from public.trip_activity;

-- Act as the owner -----------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

insert into public.saved_places (id, trip_id, added_by, title) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111', 'Fushimi Inari');

select results_eq(
  $$ select kind, payload->>'title', actor_id from public.trip_activity $$,
  $$ values ('place_added', 'Fushimi Inari', '11111111-1111-1111-1111-111111111111'::uuid) $$,
  'adding a place logs place_added with the title and actor'
);

insert into public.itinerary_items (id, trip_id, place_id, day_index, sort_order) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1, 1);

select public.reorder_itinerary_day('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2,
  array['cccccccc-0000-0000-0000-000000000001']::uuid[]);

select is(
  (select count(*)::int from public.trip_activity where kind = 'itinerary_reordered'),
  1,
  'reorder logs exactly one event'
);

select is(
  public.get_unread_activity_count('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0,
  'own actions are not unread'
);

select throws_ok(
  $$ insert into public.trip_activity (trip_id, kind)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'forged') $$,
  '42501', null,
  'members cannot insert activity directly'
);

select throws_ok(
  $$ select public.log_trip_activity('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'forged', '{}'::jsonb) $$,
  '42501', null,
  'members cannot call the logging helper'
);

-- Act as the other member ----------------------------------------------------
set local request.jwt.claims = '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';

insert into public.votes (place_id, user_id, value) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 'yaay');

select is(
  (select count(*)::int from public.trip_activity where kind = 'vote' and payload->>'value' = 'yaay'),
  1,
  'voting logs a vote event'
);

select is(
  public.get_unread_activity_count('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  3,
  'the owner''s three actions are unread for the member'
);

select lives_ok(
  $$ select public.mark_activity_seen('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
  'member can mark activity seen'
);

-- Deleting the place removes its itinerary item by cascade; only
-- place_deleted should be logged for it.
reset role;
delete from public.saved_places where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
set local role authenticated;

select results_eq(
  $$ select (count(*) filter (where kind = 'place_deleted'))::int,
            (count(*) filter (where kind = 'itinerary_removed'))::int
     from public.trip_activity $$,
  $$ values (1, 0) $$,
  'deleting a place logs place_deleted but not itinerary_removed'
);

-- Act as the outsider --------------------------------------------------------
set local request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select is_empty(
  $$ select id from public.trip_activity $$,
  'non-member cannot read activity'
);

select throws_ok(
  $$ select public.mark_activity_seen('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
  '42501', null,
  'non-member cannot mark activity seen'
);

-- Deleting the trip must not fail on activity rows logged during the cascade.
reset role;
select lives_ok(
  $$ delete from public.trips where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'deleting a trip cascades cleanly'
);

select * from finish();
rollback;
