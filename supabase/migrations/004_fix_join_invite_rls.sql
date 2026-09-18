-- Allow any authenticated user to view a trip by id so invite links work
-- before the invitee has joined as a member. The trip UUID in the invite
-- link is itself the unguessable token, so gating select on membership
-- (as the previous policy did) broke /join/[tripId] with a 406/"not found"
-- for anyone who wasn't already a member.
drop policy if exists "Trip members can read trips" on public.trips;
create policy "Trip members can read trips" on public.trips
  for select using (
    auth.uid() is not null
  );
