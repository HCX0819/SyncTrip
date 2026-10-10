-- Comments on places.
-- trip_id is stored on each row so RLS can use is_trip_member() directly; a
-- BEFORE trigger fills it in from the place (or rejects a mismatch) so it can
-- never point at a different trip than the place does.
-- Members read and add comments as themselves. The author or the trip owner
-- can delete. Comments can't be edited (no update policy).
-- Each new comment logs a 'comment_added' activity event.

create table if not exists public.place_comments (
  id uuid default gen_random_uuid() primary key,
  place_id uuid references public.saved_places(id) on delete cascade not null,
  trip_id uuid references public.trips(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz default now() not null
);

create index if not exists place_comments_place_created_idx
  on public.place_comments (place_id, created_at);
create index if not exists place_comments_trip_idx
  on public.place_comments (trip_id);

alter table public.place_comments enable row level security;

drop policy if exists "Members can read place comments" on public.place_comments;
create policy "Members can read place comments" on public.place_comments
  for select using (public.is_trip_member(trip_id, auth.uid()));

drop policy if exists "Members can add their own comments" on public.place_comments;
create policy "Members can add their own comments" on public.place_comments
  for insert with check (
    user_id = auth.uid() and public.is_trip_member(trip_id, auth.uid())
  );

drop policy if exists "Authors and owners can delete comments" on public.place_comments;
create policy "Authors and owners can delete comments" on public.place_comments
  for delete using (
    user_id = auth.uid() or public.is_trip_owner(trip_id, auth.uid())
  );

revoke update on public.place_comments from anon, authenticated;

-- ---------------------------------------------------------------------------
-- trip_id must match the place's trip
-- ---------------------------------------------------------------------------
create or replace function public.trg_place_comments_trip_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id uuid;
begin
  select trip_id into v_trip_id from public.saved_places where id = new.place_id;
  if v_trip_id is null then
    raise exception 'Place not found' using errcode = '23503';
  end if;
  if new.trip_id is null then
    new.trip_id := v_trip_id;
  elsif new.trip_id <> v_trip_id then
    raise exception 'Comment trip_id does not match the place''s trip' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists place_comments_trip_id on public.place_comments;
create trigger place_comments_trip_id
  before insert or update of place_id, trip_id on public.place_comments
  for each row execute function public.trg_place_comments_trip_id();

-- ---------------------------------------------------------------------------
-- Activity
-- ---------------------------------------------------------------------------
create or replace function public.trg_place_comments_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  select title into v_title from public.saved_places where id = new.place_id;
  perform public.log_trip_activity(new.trip_id, 'comment_added',
    jsonb_build_object('place_id', new.place_id, 'title', v_title, 'body', left(new.body, 80)));
  return null;
end;
$$;

drop trigger if exists place_comments_activity on public.place_comments;
create trigger place_comments_activity
  after insert on public.place_comments
  for each row execute function public.trg_place_comments_activity();

revoke execute on function public.trg_place_comments_trip_id() from public, anon, authenticated;
revoke execute on function public.trg_place_comments_activity() from public, anon, authenticated;
