-- Itinerary times and travel mode.
-- 1. itinerary_items get an optional start/end time of day. Members already
--    have full write access through "Trip members can modify itinerary"
--    (for all, migration 002), so no policy changes are needed.
-- 2. trips.travel_mode picks walking or driving for the travel-time estimates
--    between stops. Migration 006 limits trips updates to a column grant, so
--    the new column is added to it (owners only, via the existing policy).

-- ---------------------------------------------------------------------------
-- Itinerary item times
-- ---------------------------------------------------------------------------
alter table public.itinerary_items
  add column if not exists start_time time,
  add column if not exists end_time time;

alter table public.itinerary_items
  drop constraint if exists itinerary_items_time_order;
alter table public.itinerary_items
  add constraint itinerary_items_time_order
  check (start_time is null or end_time is null or end_time > start_time);

-- ---------------------------------------------------------------------------
-- Trip travel mode
-- ---------------------------------------------------------------------------
alter table public.trips
  add column if not exists travel_mode text not null default 'walk';

alter table public.trips
  drop constraint if exists trips_travel_mode_check;
alter table public.trips
  add constraint trips_travel_mode_check
  check (travel_mode in ('walk', 'drive'));

grant update (travel_mode) on public.trips to authenticated;

-- Trip updates are owner-only (006), but the travel mode is a shared view
-- setting any member may change.
create or replace function public.set_travel_mode(p_trip_id uuid, p_mode text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_trip_member(p_trip_id, auth.uid()) then
    raise exception 'Not a member of this trip' using errcode = '42501';
  end if;

  update public.trips set travel_mode = p_mode where id = p_trip_id;
end;
$$;

revoke execute on function public.set_travel_mode(uuid, text) from public, anon;
grant execute on function public.set_travel_mode(uuid, text) to authenticated;
