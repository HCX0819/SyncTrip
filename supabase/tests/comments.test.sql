-- Place comments from migration 009. Run with: supabase test db
-- Everything happens in one transaction that is rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

-- Fixtures (as postgres, bypassing RLS) -------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@test.dev'),
  ('22222222-2222-2222-2222-222222222222', 'outsider@test.dev'),
  ('33333333-3333-3333-3333-333333333333', 'member@test.dev');

-- Trip A: owned by 1111, with 3333 as a member.
-- Trip B: owned by 3333, so 3333 can write to both (used for the mismatch case).
insert into public.trips (id, name, destination, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Kyoto', 'Kyoto', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-bbbbbbbbbbbb', 'Osaka', 'Osaka', '33333333-3333-3333-3333-333333333333');

insert into public.trip_members (trip_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'member'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 'owner');

insert into public.saved_places (id, trip_id, added_by, title) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111', 'Fushimi Inari'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-bbbbbbbbbbbb',
   '33333333-3333-3333-3333-333333333333', 'Dotonbori');

-- The fixtures above log member_joined / place_added; start from an empty feed.
delete from public.trip_activity;

-- Act as the member ----------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.place_comments (id, place_id, trip_id, user_id, body) values
       ('dddddddd-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333',
        'Go at sunrise') $$,
  'member can comment on a place in their trip'
);

select results_eq(
  $$ select kind, payload->>'title', payload->>'body', actor_id from public.trip_activity $$,
  $$ values ('comment_added', 'Fushimi Inari', 'Go at sunrise', '33333333-3333-3333-3333-333333333333'::uuid) $$,
  'commenting logs comment_added with the place title, body and actor'
);

insert into public.place_comments (id, place_id, trip_id, user_id, body) values
  ('dddddddd-0000-0000-0000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333',
   repeat('x', 200));

select is(
  (select char_length(payload->>'body') from public.trip_activity
   where payload->>'body' like 'xxx%'),
  80,
  'the activity body preview is cut to 80 characters'
);

select throws_ok(
  $$ insert into public.place_comments (place_id, trip_id, user_id, body) values
       ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '11111111-1111-1111-1111-111111111111', 'Pretending to be the owner') $$,
  '42501', null,
  'member cannot comment as someone else'
);

select throws_ok(
  $$ insert into public.place_comments (place_id, trip_id, user_id, body) values
       ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-bbbbbbbbbbbb',
        '33333333-3333-3333-3333-333333333333', 'Wrong trip') $$,
  '23514', null,
  'trip_id must match the place''s trip'
);

select throws_ok(
  $$ insert into public.place_comments (place_id, trip_id, user_id, body) values
       ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '33333333-3333-3333-3333-333333333333', '') $$,
  '23514', null,
  'empty comments are rejected'
);

-- Act as the owner -----------------------------------------------------------
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select is(
  (select count(*)::int from public.place_comments),
  2,
  'owner can read the member''s comments'
);

insert into public.place_comments (id, place_id, trip_id, user_id, body) values
  ('dddddddd-0000-0000-0000-000000000003', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   'Owner comment');

-- Act as the outsider --------------------------------------------------------
set local request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select is_empty(
  $$ select id from public.place_comments $$,
  'non-member cannot read comments'
);

select throws_ok(
  $$ insert into public.place_comments (place_id, trip_id, user_id, body) values
       ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '22222222-2222-2222-2222-222222222222', 'Let me in') $$,
  '42501', null,
  'non-member cannot comment'
);

delete from public.place_comments;

reset role;
select is(
  (select count(*)::int from public.place_comments),
  3,
  'non-member cannot delete comments'
);
set local role authenticated;

-- Back to the member ---------------------------------------------------------
set local request.jwt.claims = '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';

delete from public.place_comments where id = 'dddddddd-0000-0000-0000-000000000003';

select is(
  (select count(*)::int from public.place_comments where id = 'dddddddd-0000-0000-0000-000000000003'),
  1,
  'member cannot delete someone else''s comment'
);

delete from public.place_comments where id = 'dddddddd-0000-0000-0000-000000000001';

select is(
  (select count(*)::int from public.place_comments where id = 'dddddddd-0000-0000-0000-000000000001'),
  0,
  'author can delete their own comment'
);

-- Owner removes the member's remaining comment --------------------------------
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

delete from public.place_comments where id = 'dddddddd-0000-0000-0000-000000000002';

select is(
  (select count(*)::int from public.place_comments where id = 'dddddddd-0000-0000-0000-000000000002'),
  0,
  'trip owner can delete any comment in their trip'
);

-- Deleting the place removes its comments.
reset role;
delete from public.saved_places where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

select is_empty(
  $$ select id from public.place_comments $$,
  'deleting a place cascades to its comments'
);

select * from finish();
rollback;
