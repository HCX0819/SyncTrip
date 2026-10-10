-- Activity feed.
-- trip_activity is written only by the triggers and RPCs below (no insert
-- policy), so members can read it but never forge entries. Each row keeps a
-- snapshot of what it refers to in payload (place title, member name, actor
-- name), so the feed still reads correctly after the place is deleted or the
-- actor leaves the trip.
-- trip_members.last_seen_activity_at drives the unread badge.

create table if not exists public.trip_activity (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references public.trips(id) on delete cascade not null,
  actor_id uuid references public.profiles(id) on delete set null,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz default now() not null
);

create index if not exists trip_activity_trip_created_idx
  on public.trip_activity (trip_id, created_at desc);

alter table public.trip_activity enable row level security;

drop policy if exists "Members can read trip activity" on public.trip_activity;
create policy "Members can read trip activity" on public.trip_activity
  for select using (public.is_trip_member(trip_id, auth.uid()));

revoke insert, update, delete on public.trip_activity from anon, authenticated;

-- Existing members start with nothing unread.
alter table public.trip_members
  add column if not exists last_seen_activity_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- Logging helper (internal)
-- ---------------------------------------------------------------------------
-- Skips silently when the trip is already gone: deleting a trip cascades to
-- places and members, whose triggers would otherwise insert rows pointing at
-- the deleted trip.
create or replace function public.log_trip_activity(p_trip_id uuid, p_kind text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_name text;
begin
  if not exists (select 1 from public.trips where id = p_trip_id) then
    return;
  end if;

  select display_name into v_actor_name from public.profiles where id = v_actor;

  insert into public.trip_activity (trip_id, actor_id, kind, payload)
  values (p_trip_id, v_actor, p_kind, p_payload || jsonb_build_object('actor_name', v_actor_name));
end;
$$;

revoke execute on function public.log_trip_activity(uuid, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function public.trg_saved_places_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_trip_activity(new.trip_id, 'place_added',
      jsonb_build_object('place_id', new.id, 'title', new.title, 'category', new.category));
  elsif tg_op = 'DELETE' then
    perform public.log_trip_activity(old.trip_id, 'place_deleted',
      jsonb_build_object('title', old.title));
  end if;
  return null;
end;
$$;

drop trigger if exists saved_places_activity on public.saved_places;
create trigger saved_places_activity
  after insert or delete on public.saved_places
  for each row execute function public.trg_saved_places_activity();

create or replace function public.trg_votes_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_place public.saved_places;
begin
  if tg_op = 'UPDATE' and new.value = old.value then
    return null;
  end if;
  select * into v_place from public.saved_places where id = new.place_id;
  if v_place.id is null then
    return null;
  end if;
  perform public.log_trip_activity(v_place.trip_id, 'vote',
    jsonb_build_object('place_id', v_place.id, 'title', v_place.title, 'value', new.value));
  return null;
end;
$$;

drop trigger if exists votes_activity on public.votes;
create trigger votes_activity
  after insert or update on public.votes
  for each row execute function public.trg_votes_activity();

create or replace function public.trg_itinerary_items_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  if tg_op = 'INSERT' then
    select title into v_title from public.saved_places where id = new.place_id;
    perform public.log_trip_activity(new.trip_id, 'itinerary_added',
      jsonb_build_object('place_id', new.place_id, 'title', v_title, 'day_index', new.day_index));
  elsif tg_op = 'DELETE' then
    select title into v_title from public.saved_places where id = old.place_id;
    -- Deleting a place cascades here; 'place_deleted' already covers it.
    if v_title is null then
      return null;
    end if;
    perform public.log_trip_activity(old.trip_id, 'itinerary_removed',
      jsonb_build_object('place_id', old.place_id, 'title', v_title, 'day_index', old.day_index));
  end if;
  return null;
end;
$$;

drop trigger if exists itinerary_items_activity on public.itinerary_items;
create trigger itinerary_items_activity
  after insert or delete on public.itinerary_items
  for each row execute function public.trg_itinerary_items_activity();

create or replace function public.trg_trip_members_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if tg_op = 'INSERT' then
    -- The creator adding themselves as owner isn't news.
    if new.role = 'owner' then
      return null;
    end if;
    select display_name into v_name from public.profiles where id = new.user_id;
    perform public.log_trip_activity(new.trip_id, 'member_joined',
      jsonb_build_object('user_id', new.user_id, 'name', v_name));
  elsif tg_op = 'DELETE' then
    select display_name into v_name from public.profiles where id = old.user_id;
    perform public.log_trip_activity(old.trip_id,
      case when old.user_id = auth.uid() then 'member_left' else 'member_removed' end,
      jsonb_build_object('user_id', old.user_id, 'name', v_name));
  end if;
  return null;
end;
$$;

drop trigger if exists trip_members_activity on public.trip_members;
create trigger trip_members_activity
  after insert or delete on public.trip_members
  for each row execute function public.trg_trip_members_activity();

revoke execute on function public.trg_saved_places_activity() from public, anon, authenticated;
revoke execute on function public.trg_votes_activity() from public, anon, authenticated;
revoke execute on function public.trg_itinerary_items_activity() from public, anon, authenticated;
revoke execute on function public.trg_trip_members_activity() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reordering logs one event per call rather than one per moved row.
-- ---------------------------------------------------------------------------
create or replace function public.reorder_itinerary_day(
  p_trip_id uuid,
  p_day_index int,
  p_item_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_trip_member(p_trip_id, auth.uid()) then
    raise exception 'Not a member of this trip' using errcode = '42501';
  end if;

  if p_day_index is null or p_day_index < 1 then
    raise exception 'Invalid day index';
  end if;

  update public.itinerary_items i
  set day_index = p_day_index,
      sort_order = o.position::int
  from unnest(p_item_ids) with ordinality as o(item_id, position)
  where i.id = o.item_id
    and i.trip_id = p_trip_id;

  perform public.log_trip_activity(p_trip_id, 'itinerary_reordered',
    jsonb_build_object('day_index', p_day_index));
end;
$$;

revoke execute on function public.reorder_itinerary_day(uuid, int, uuid[]) from public, anon;
grant execute on function public.reorder_itinerary_day(uuid, int, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Unread badge
-- ---------------------------------------------------------------------------
create or replace function public.get_unread_activity_count(p_trip_id uuid)
returns int
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int
  from public.trip_activity a
  join public.trip_members m on m.trip_id = a.trip_id and m.user_id = auth.uid()
  where a.trip_id = p_trip_id
    and a.created_at > m.last_seen_activity_at
    and a.actor_id is distinct from auth.uid();
$$;

create or replace function public.mark_activity_seen(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_trip_member(p_trip_id, auth.uid()) then
    raise exception 'Not a member of this trip' using errcode = '42501';
  end if;

  update public.trip_members
  set last_seen_activity_at = now()
  where trip_id = p_trip_id and user_id = auth.uid();
end;
$$;

revoke execute on function public.get_unread_activity_count(uuid) from public, anon;
grant execute on function public.get_unread_activity_count(uuid) to authenticated;
revoke execute on function public.mark_activity_seen(uuid) from public, anon;
grant execute on function public.mark_activity_seen(uuid) to authenticated;
