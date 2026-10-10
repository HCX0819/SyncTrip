-- Shared expenses from migration 011. Run with: supabase test db
-- Everything happens in one transaction that is rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;

select plan(26);

-- Fixtures (as postgres, bypassing RLS) -------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@test.dev'),
  ('22222222-2222-2222-2222-222222222222', 'outsider@test.dev'),
  ('33333333-3333-3333-3333-333333333333', 'member@test.dev'),
  ('44444444-4444-4444-4444-444444444444', 'member2@test.dev');

insert into public.trips (id, name, destination, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Kyoto', 'Kyoto', '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Lisbon', 'Lisbon', '11111111-1111-1111-1111-111111111111');

insert into public.trip_members (trip_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'member'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'member'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '11111111-1111-1111-1111-111111111111', 'owner');

-- An expense in the other trip, used to check cross-trip updates are refused.
insert into public.expenses (id, trip_id, description, amount_cents, paid_by, created_by) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Tram',
   300, '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111');
insert into public.expense_shares (expense_id, user_id, amount_cents) values
  ('eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 300);

-- The member fixtures above log member_joined events; start from an empty feed.
delete from public.trip_activity;

-- Act as a member ------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';

select lives_ok(
  $$ select public.save_expense(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'Dinner', 1000,
       '33333333-3333-3333-3333-333333333333', '2026-05-01', 'food', null, false,
       '[{"user_id": "11111111-1111-1111-1111-111111111111", "amount_cents": 333},
         {"user_id": "33333333-3333-3333-3333-333333333333", "amount_cents": 334},
         {"user_id": "44444444-4444-4444-4444-444444444444", "amount_cents": 333}]'::jsonb) $$,
  'member can add an expense split three ways'
);

select results_eq(
  $$ select e.amount_cents, e.created_by, (select sum(s.amount_cents)::bigint from public.expense_shares s where s.expense_id = e.id)
     from public.expenses e where e.description = 'Dinner' $$,
  $$ values (1000::bigint, '33333333-3333-3333-3333-333333333333'::uuid, 1000::bigint) $$,
  'expense and its shares are stored'
);

select results_eq(
  $$ select kind, payload->>'description', (payload->>'amount_cents')::int, payload->>'currency'
     from public.trip_activity $$,
  $$ values ('expense_added', 'Dinner', 1000, 'USD') $$,
  'adding an expense logs expense_added with amount and currency'
);

select throws_like(
  $$ select public.save_expense(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'Taxi', 1000,
       '33333333-3333-3333-3333-333333333333', null, null, null, false,
       '[{"user_id": "11111111-1111-1111-1111-111111111111", "amount_cents": 500},
         {"user_id": "33333333-3333-3333-3333-333333333333", "amount_cents": 499}]'::jsonb) $$,
  '%add up%',
  'shares that don''t add up to the amount are rejected'
);

select throws_like(
  $$ select public.save_expense(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'Taxi', 1000,
       '22222222-2222-2222-2222-222222222222', null, null, null, false,
       '[{"user_id": "33333333-3333-3333-3333-333333333333", "amount_cents": 1000}]'::jsonb) $$,
  '%payer must be a member%',
  'a payer who isn''t a member is rejected'
);

select throws_like(
  $$ select public.save_expense(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'Taxi', 1000,
       '33333333-3333-3333-3333-333333333333', null, null, null, false,
       '[{"user_id": "22222222-2222-2222-2222-222222222222", "amount_cents": 1000}]'::jsonb) $$,
  '%Everyone sharing%',
  'a share for a non-member is rejected'
);

select throws_like(
  $$ select public.save_expense(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'Taxi', 1000,
       '33333333-3333-3333-3333-333333333333', null, null, null, false, '[]'::jsonb) $$,
  '%At least one person%',
  'empty shares are rejected'
);

select throws_like(
  $$ select public.save_expense(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'Taxi', 1000,
       '33333333-3333-3333-3333-333333333333', null, null, null, false,
       '[{"user_id": "33333333-3333-3333-3333-333333333333", "amount_cents": 500},
         {"user_id": "33333333-3333-3333-3333-333333333333", "amount_cents": 500}]'::jsonb) $$,
  '%only appear once%',
  'the same person twice in the shares is rejected'
);

select throws_like(
  $$ select public.save_expense(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'Taxi', 0,
       '33333333-3333-3333-3333-333333333333', null, null, null, false,
       '[{"user_id": "33333333-3333-3333-3333-333333333333", "amount_cents": 0}]'::jsonb) $$,
  '%greater than zero%',
  'a zero amount is rejected'
);

select throws_like(
  $$ select public.save_expense(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'Taxi', 1000,
       '33333333-3333-3333-3333-333333333333', null, null, null, false,
       '[{"user_id": "33333333-3333-3333-3333-333333333333", "amount_cents": 1500},
         {"user_id": "44444444-4444-4444-4444-444444444444", "amount_cents": -500}]'::jsonb) $$,
  '%non-negative%',
  'negative shares are rejected'
);

select throws_like(
  $$ select public.save_expense(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'eeeeeeee-0000-0000-0000-000000000001', 'Tram', 300,
       '33333333-3333-3333-3333-333333333333', null, null, null, false,
       '[{"user_id": "33333333-3333-3333-3333-333333333333", "amount_cents": 300}]'::jsonb) $$,
  '%Expense not found%',
  'an expense from another trip can''t be updated through this trip'
);

-- Update replaces the shares.
select lives_ok(
  $$ select public.save_expense(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       (select id from public.expenses where description = 'Dinner'),
       'Dinner', 1200,
       '33333333-3333-3333-3333-333333333333', '2026-05-01', 'food', null, false,
       '[{"user_id": "11111111-1111-1111-1111-111111111111", "amount_cents": 600},
         {"user_id": "33333333-3333-3333-3333-333333333333", "amount_cents": 600}]'::jsonb) $$,
  'creator can edit their expense'
);

select results_eq(
  $$ select count(*)::int, sum(s.amount_cents)::bigint
     from public.expense_shares s join public.expenses e on e.id = s.expense_id
     where e.description = 'Dinner' $$,
  $$ values (2, 1200::bigint) $$,
  'editing replaces the shares'
);

select throws_like(
  $$ select public.save_expense(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'Pay back', 500,
       '33333333-3333-3333-3333-333333333333', null, null, null, true,
       '[{"user_id": "11111111-1111-1111-1111-111111111111", "amount_cents": 250},
         {"user_id": "44444444-4444-4444-4444-444444444444", "amount_cents": 250}]'::jsonb) $$,
  '%exactly one other member%',
  'a settlement must go to exactly one person'
);

select lives_ok(
  $$ select public.save_expense(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'Settle up', 600,
       '33333333-3333-3333-3333-333333333333', null, null, null, true,
       '[{"user_id": "11111111-1111-1111-1111-111111111111", "amount_cents": 600}]'::jsonb) $$,
  'member can record a settlement'
);

select is(
  (select count(*)::int from public.trip_activity where kind = 'settlement_recorded'),
  1,
  'recording a settlement logs settlement_recorded'
);

select throws_ok(
  $$ insert into public.expenses (trip_id, description, amount_cents, paid_by)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Forged', 100, '33333333-3333-3333-3333-333333333333') $$,
  '42501', null,
  'members cannot insert expenses directly'
);

select throws_ok(
  $$ delete from public.expense_shares $$,
  '42501', null,
  'members cannot delete expense shares directly'
);

select isnt_empty(
  $$ select 1 from public.expense_shares s join public.expenses e on e.id = s.expense_id
     where e.trip_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'members can read expense shares'
);

-- Act as the other member ----------------------------------------------------
set local request.jwt.claims = '{"sub": "44444444-4444-4444-4444-444444444444", "role": "authenticated"}';

select throws_ok(
  $$ select public.delete_expense((select id from public.expenses where description = 'Dinner')) $$,
  '42501', null,
  'a member who didn''t add the expense can''t delete it'
);

-- Act as the outsider --------------------------------------------------------
set local request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select is_empty(
  $$ select id from public.expenses $$,
  'non-member cannot read expenses'
);

select is_empty(
  $$ select expense_id from public.expense_shares $$,
  'non-member cannot read expense shares'
);

select throws_ok(
  $$ select public.save_expense(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'Sneaky', 100,
       '11111111-1111-1111-1111-111111111111', null, null, null, false,
       '[{"user_id": "11111111-1111-1111-1111-111111111111", "amount_cents": 100}]'::jsonb) $$,
  '42501', null,
  'non-member cannot add expenses'
);

-- Act as the owner -----------------------------------------------------------
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select lives_ok(
  $$ select public.delete_expense((select id from public.expenses where description = 'Dinner')) $$,
  'the trip owner can delete any expense'
);

select results_eq(
  $$ select payload->>'description', payload->>'currency' from public.trip_activity where kind = 'expense_deleted' $$,
  $$ values ('Dinner', 'USD') $$,
  'deleting an expense logs expense_deleted'
);

select lives_ok(
  $$ update public.trips set currency = 'EUR' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'the owner can change the trip currency'
);

select * from finish();
rollback;
