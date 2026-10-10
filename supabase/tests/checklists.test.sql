-- Checklists from migration 013. Run with: supabase test db
-- Everything happens in one transaction that is rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;

select plan(18);

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

-- The member fixture above logs a member_joined event; start from an empty feed.
delete from public.trip_activity;

-- Act as the owner -----------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.checklist_items (id, trip_id, list, title, sort_order) values
       ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'packing', 'Passport', 1),
       ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'packing', 'Charger', 2) $$,
  'member can add checklist items'
);

select results_eq(
  $$ select kind, payload->>'title', payload->>'list', actor_id
     from public.trip_activity order by payload->>'title' $$,
  $$ values ('checklist_added', 'Charger', 'packing', '11111111-1111-1111-1111-111111111111'::uuid),
            ('checklist_added', 'Passport', 'packing', '11111111-1111-1111-1111-111111111111'::uuid) $$,
  'adding items logs checklist_added with title and list'
);

select is(
  (select created_by from public.checklist_items where id = 'dddddddd-0000-0000-0000-000000000001'),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'created_by defaults to the current user'
);

select throws_ok(
  $$ insert into public.checklist_items (trip_id, list, title, created_by) values
       ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'todo', 'Book trains', '33333333-3333-3333-3333-333333333333') $$,
  '42501', null,
  'created_by cannot be someone else'
);

select throws_ok(
  $$ update public.checklist_items set assignee_id = '22222222-2222-2222-2222-222222222222'
     where id = 'dddddddd-0000-0000-0000-000000000001' $$,
  '23514', null,
  'assignee must be a trip member'
);

select lives_ok(
  $$ update public.checklist_items set assignee_id = '33333333-3333-3333-3333-333333333333'
     where id = 'dddddddd-0000-0000-0000-000000000001' $$,
  'items can be assigned to a trip member'
);

-- Act as the other member ----------------------------------------------------
set local request.jwt.claims = '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';

update public.checklist_items set done = true, done_by = '11111111-1111-1111-1111-111111111111'
where id = 'dddddddd-0000-0000-0000-000000000001';

select is(
  (select done_by from public.checklist_items where id = 'dddddddd-0000-0000-0000-000000000001'),
  '33333333-3333-3333-3333-333333333333'::uuid,
  'ticking an item sets done_by to the current user, ignoring the client value'
);

select results_eq(
  $$ select payload->>'title', payload->>'list', actor_id
     from public.trip_activity where kind = 'checklist_done' $$,
  $$ values ('Passport', 'packing', '33333333-3333-3333-3333-333333333333'::uuid) $$,
  'ticking an item logs checklist_done'
);

-- Editing the title of a ticked item keeps done_by and logs nothing new.
update public.checklist_items set title = 'Passports', done_by = null
where id = 'dddddddd-0000-0000-0000-000000000001';

select results_eq(
  $$ select c.done_by,
            (select count(*) from public.trip_activity where kind = 'checklist_done')::int
     from public.checklist_items c where c.id = 'dddddddd-0000-0000-0000-000000000001' $$,
  $$ values ('33333333-3333-3333-3333-333333333333'::uuid, 1) $$,
  'other edits keep done_by and do not log checklist_done again'
);

update public.checklist_items set done = false
where id = 'dddddddd-0000-0000-0000-000000000001';

select is(
  (select done_by from public.checklist_items where id = 'dddddddd-0000-0000-0000-000000000001'),
  null::uuid,
  'unticking clears done_by'
);

select public.reorder_checklist('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'packing',
  array['dddddddd-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000001']::uuid[]);

select results_eq(
  $$ select id from public.checklist_items
     where trip_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and list = 'packing'
     order by sort_order $$,
  $$ values ('dddddddd-0000-0000-0000-000000000002'::uuid), ('dddddddd-0000-0000-0000-000000000001'::uuid) $$,
  'reorder_checklist writes the new order'
);

select throws_ok(
  $$ select public.reorder_checklist('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'groceries',
       array['dddddddd-0000-0000-0000-000000000001']::uuid[]) $$,
  'P0001', 'Invalid list',
  'reorder_checklist rejects unknown lists'
);

-- Act as the outsider --------------------------------------------------------
set local request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select is_empty(
  $$ select id from public.checklist_items $$,
  'non-member cannot read checklist items'
);

select throws_ok(
  $$ insert into public.checklist_items (trip_id, list, title) values
       ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'todo', 'Sneaky') $$,
  '42501', null,
  'non-member cannot add checklist items'
);

select throws_ok(
  $$ select public.reorder_checklist('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'packing',
       array['dddddddd-0000-0000-0000-000000000001']::uuid[]) $$,
  '42501', null,
  'non-member cannot reorder a checklist'
);

-- Silently filtered by RLS; checked below as postgres.
update public.checklist_items set title = 'Hacked';
delete from public.checklist_items;

reset role;

select results_eq(
  $$ select (count(*) filter (where title = 'Hacked'))::int, count(*)::int
     from public.checklist_items $$,
  $$ values (0, 2) $$,
  'non-member cannot update or delete checklist items'
);

-- The member leaving unassigns them from the trip's items.
delete from public.trip_members
where trip_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  and user_id = '33333333-3333-3333-3333-333333333333';

select is(
  (select assignee_id from public.checklist_items where id = 'dddddddd-0000-0000-0000-000000000001'),
  null::uuid,
  'leaving a trip clears your checklist assignments'
);

select lives_ok(
  $$ delete from public.trips where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'deleting a trip cascades cleanly'
);

select * from finish();
rollback;
