-- Add update and delete policies for saved_places
drop policy if exists "Trip members can update saved places" on public.saved_places;
create policy "Trip members can update saved places" on public.saved_places
  for update using (
    public.is_trip_member(trip_id, auth.uid())
  );

drop policy if exists "Trip members can delete saved places" on public.saved_places;
create policy "Trip members can delete saved places" on public.saved_places
  for delete using (
    public.is_trip_member(trip_id, auth.uid())
  );
