-- Fix RLS recursion with a security definer helper function
create or replace function public.is_trip_member(lookup_trip_id uuid, lookup_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = lookup_trip_id and user_id = lookup_user_id
  );
$$;

-- 1. Trips policies
drop policy if exists "Trip members can read trips" on public.trips;
create policy "Trip members can read trips" on public.trips
  for select using (
    created_by = auth.uid() or public.is_trip_member(id, auth.uid())
  );

drop policy if exists "Trip owners can update trips" on public.trips;
create policy "Trip owners can update trips" on public.trips
  for update using (
    created_by = auth.uid()
  );

-- 2. Trip members policies (no recursive subquery on self)
drop policy if exists "Members can view membership" on public.trip_members;
create policy "Members can view membership" on public.trip_members
  for select using (
    user_id = auth.uid() or public.is_trip_member(trip_id, auth.uid())
  );

-- 3. Saved places policies
drop policy if exists "Trip members can view saved places" on public.saved_places;
create policy "Trip members can view saved places" on public.saved_places
  for select using (
    public.is_trip_member(trip_id, auth.uid())
  );

drop policy if exists "Trip members can add saved places" on public.saved_places;
create policy "Trip members can add saved places" on public.saved_places
  for insert with check (
    public.is_trip_member(trip_id, auth.uid())
  );

-- 4. Votes policies
drop policy if exists "Trip members can view votes" on public.votes;
create policy "Trip members can view votes" on public.votes
  for select using (
    exists (
      select 1 from public.saved_places sp
      where sp.id = votes.place_id
      and public.is_trip_member(sp.trip_id, auth.uid())
    )
  );

-- 5. Itinerary items policies
drop policy if exists "Trip members can view itinerary" on public.itinerary_items;
create policy "Trip members can view itinerary" on public.itinerary_items
  for select using (
    public.is_trip_member(trip_id, auth.uid())
  );

drop policy if exists "Trip members can modify itinerary" on public.itinerary_items;
create policy "Trip members can modify itinerary" on public.itinerary_items
  for all using (
    public.is_trip_member(trip_id, auth.uid())
  );
