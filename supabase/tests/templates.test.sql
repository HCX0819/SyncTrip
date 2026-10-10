-- Trip duplication and public templates from migration 014. Run with: supabase test db
-- Everything happens in one transaction that is rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

-- Fixtures (as postgres, bypassing RLS) -------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@test.dev'),
  ('22222222-2222-2222-2222-222222222222', 'outsider@test.dev'),
  ('33333333-3333-3333-3333-333333333333', 'member@test.dev');

-- A: private 3-day trip with a member. B: public template.
insert into public.trips (id, name, destination, start_date, end_date, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Kyoto', 'Kyoto', '2026-11-01', '2026-11-03',
   '11111111-1111-1111-1111-111111111111');
insert into public.trips (id, name, destination, created_by, is_public_template) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Lisbon weekend', 'Lisbon',
   '11111111-1111-1111-1111-111111111111', true);

insert into public.trip_members (trip_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'member'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'owner');

insert into public.saved_places (id, trip_id, added_by, title, category, note) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111', 'Fushimi Inari', 'do', 'go at dawn'),
  ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '33333333-3333-3333-3333-333333333333', 'Nishiki Market', 'eat', null),
  ('cccccccc-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '33333333-3333-3333-3333-333333333333', 'Ryokan', 'stay', null),
  ('cccccccc-0000-0000-0000-000000000004', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '11111111-1111-1111-1111-111111111111', 'Belem Tower', 'do', 'secret door code 1234');

insert into public.itinerary_items (trip_id, place_id, day_index, sort_order) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-0000-0000-0000-000000000001', 1, 1),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-0000-0000-0000-000000000002', 2, 1),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cccccccc-0000-0000-0000-000000000004', 2, 1);

insert into public.votes (place_id, user_id, value) values
  ('cccccccc-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'yaay');

-- One ticked, assigned packing item and one to-do in each trip.
insert into public.checklist_items (trip_id, list, title, done, assignee_id, sort_order) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'packing', 'Passport', true, '33333333-3333-3333-3333-333333333333', 1),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'todo', 'Book ryokan', false, null, 1),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'packing', 'Sunscreen', false, null, 1),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'todo', 'Call landlord re: key 4321', false, null, 1);

-- Duplicating -----------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select throws_ok(
  $$ select public.duplicate_trip('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Stolen', null) $$,
  '42501', null,
  'non-member cannot duplicate a trip'
);

select throws_ok(
  $$ select public.copy_trip_internal('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Stolen', null,
       '22222222-2222-2222-2222-222222222222') $$,
  '42501', null,
  'clients cannot call the internal copy helper'
);

set local request.jwt.claims = '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';

select lives_ok(
  $$ select public.duplicate_trip('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Kyoto again', '2027-01-10') $$,
  'member can duplicate a trip'
);

reset role;

select results_eq(
  $$ select destination, start_date, end_date, created_by, is_public_template
     from public.trips where name = 'Kyoto again' $$,
  $$ values ('Kyoto', '2027-01-10'::date, '2027-01-12'::date,
             '33333333-3333-3333-3333-333333333333'::uuid, false) $$,
  'copy keeps the destination and length, shifted to the new start date'
);

select results_eq(
  $$ select m.user_id, m.role::text from public.trip_members m
     join public.trips t on t.id = m.trip_id where t.name = 'Kyoto again' $$,
  $$ values ('33333333-3333-3333-3333-333333333333'::uuid, 'owner') $$,
  'the caller is the only member and owns the copy'
);

select results_eq(
  $$ select count(*)::int,
            (count(*) filter (where sp.added_by = '33333333-3333-3333-3333-333333333333'))::int,
            (count(*) filter (where sp.note = 'go at dawn'))::int
     from public.saved_places sp
     join public.trips t on t.id = sp.trip_id where t.name = 'Kyoto again' $$,
  $$ values (3, 3, 1) $$,
  'all places are copied, attributed to the caller, with notes'
);

select results_eq(
  $$ select count(*)::int,
            (count(*) filter (where sp.trip_id = i.trip_id))::int
     from public.itinerary_items i
     join public.trips t on t.id = i.trip_id
     join public.saved_places sp on sp.id = i.place_id
     where t.name = 'Kyoto again' $$,
  $$ values (2, 2) $$,
  'itinerary is copied and points at the copied places'
);

select results_eq(
  $$ select sp.title, i.day_index, i.sort_order
     from public.itinerary_items i
     join public.saved_places sp on sp.id = i.place_id
     join public.trips t on t.id = i.trip_id
     where t.name = 'Kyoto again' order by i.day_index $$,
  $$ values ('Fushimi Inari', 1, 1), ('Nishiki Market', 2, 1) $$,
  'itinerary days and order are kept'
);

select is_empty(
  $$ select v.id from public.votes v
     join public.saved_places sp on sp.id = v.place_id
     join public.trips t on t.id = sp.trip_id where t.name = 'Kyoto again' $$,
  'votes are not copied'
);

select is_empty(
  $$ select a.id from public.trip_activity a
     join public.trips t on t.id = a.trip_id where t.name = 'Kyoto again' $$,
  'the copy starts with an empty activity feed'
);

select results_eq(
  $$ select c.list, c.title, c.done, c.assignee_id, c.done_by
     from public.checklist_items c
     join public.trips t on t.id = c.trip_id where t.name = 'Kyoto again' order by c.list $$,
  $$ values ('packing', 'Passport', false, null::uuid, null::uuid),
            ('todo', 'Book ryokan', false, null::uuid, null::uuid) $$,
  'checklists are copied unticked and unassigned'
);

-- Templates -------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select throws_ok(
  $$ select public.use_template('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Stolen', null) $$,
  '42501', null,
  'use_template rejects trips that are not public templates'
);

select results_eq(
  $$ select id, name, destination, day_count, place_count from public.list_templates() $$,
  $$ values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'Lisbon weekend', 'Lisbon', 2, 1) $$,
  'list_templates shows only public templates'
);

select ok(
  public.get_template('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') is null,
  'get_template hides private trips'
);

select ok(
  not (public.get_template('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')::text
       ~ '(note|secret door|invite_token|created_by|added_by|members)'),
  'get_template returns no notes, tokens, creators or members'
);

select is(
  public.get_template('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')->'places'->0->>'title',
  'Belem Tower',
  'get_template includes the places'
);

select lives_ok(
  $$ select public.use_template('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'My Lisbon', '2027-03-05') $$,
  'any signed-in user can use a public template'
);

reset role;

select results_eq(
  $$ select t.end_date, t.created_by, sp.note
     from public.trips t join public.saved_places sp on sp.trip_id = t.id
     where t.name = 'My Lisbon' $$,
  $$ values ('2027-03-06'::date, '22222222-2222-2222-2222-222222222222'::uuid, null::text) $$,
  'template copy is owned by the caller, sized by its itinerary, without notes'
);

select results_eq(
  $$ select c.list, c.title from public.checklist_items c
     join public.trips t on t.id = c.trip_id where t.name = 'My Lisbon' $$,
  $$ values ('packing', 'Sunscreen') $$,
  'template copy gets the packing list but not the to-dos'
);

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

select throws_ok(
  $$ select * from public.list_templates() $$,
  '42501', null,
  'anonymous users cannot list templates'
);

select * from finish();
rollback;
