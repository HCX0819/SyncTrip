-- Security hardening before production.
-- 1. Invites use an unguessable, rotatable token instead of the trip id, and
--    joining goes through join_trip() so nobody can insert themselves (or an
--    'owner' role) into an arbitrary trip.
-- 2. Trips are readable by members only again (reverts 004).
-- 3. Votes and saved places require trip membership.
-- 4. Profiles are visible to trip-mates only, and email is never exposed.
-- 5. Photo uploads are limited to images under 5 MB in a trip the user belongs to.

-- ---------------------------------------------------------------------------
-- Invite tokens
-- ---------------------------------------------------------------------------
alter table public.trips
  add column if not exists invite_token text not null default replace(gen_random_uuid()::text, '-', '');

create unique index if not exists trips_invite_token_key on public.trips (invite_token);

create or replace function public.get_trip_invite_preview(p_token text)
returns table (id uuid, name text, destination text, is_member boolean)
language sql
security definer
set search_path = public
stable
as $$
  select t.id, t.name, t.destination, public.is_trip_member(t.id, auth.uid())
  from public.trips t
  where t.invite_token = p_token and auth.uid() is not null;
$$;

create or replace function public.join_trip(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select id into v_trip_id from public.trips where invite_token = p_token;
  if v_trip_id is null then
    raise exception 'Invalid invite link';
  end if;

  insert into public.trip_members (trip_id, user_id, role)
  values (v_trip_id, auth.uid(), 'member')
  on conflict (trip_id, user_id) do nothing;

  return v_trip_id;
end;
$$;

-- Owners can invalidate the current link and get a new one.
create or replace function public.rotate_invite_token(p_trip_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := replace(gen_random_uuid()::text, '-', '');
begin
  if not exists (
    select 1 from public.trip_members
    where trip_id = p_trip_id and user_id = auth.uid() and role = 'owner'
  ) then
    raise exception 'Only the trip owner can reset the invite link';
  end if;

  update public.trips set invite_token = v_token where id = p_trip_id;
  return v_token;
end;
$$;

revoke execute on function public.get_trip_invite_preview(text) from public, anon;
revoke execute on function public.join_trip(text) from public, anon;
revoke execute on function public.rotate_invite_token(uuid) from public, anon;
grant execute on function public.get_trip_invite_preview(text) to authenticated;
grant execute on function public.join_trip(text) to authenticated;
grant execute on function public.rotate_invite_token(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Trips & membership
-- ---------------------------------------------------------------------------
drop policy if exists "Trip members can read trips" on public.trips;
create policy "Trip members can read trips" on public.trips
  for select using (
    created_by = auth.uid() or public.is_trip_member(id, auth.uid())
  );

-- Direct inserts are only for the creator adding themselves as owner right
-- after creating a trip; everyone else joins via join_trip().
drop policy if exists "Authenticated users can join trips" on public.trip_members;
drop policy if exists "Trip creator can add self as owner" on public.trip_members;
create policy "Trip creator can add self as owner" on public.trip_members
  for insert with check (
    user_id = auth.uid()
    and role = 'owner'
    and exists (
      select 1 from public.trips t
      where t.id = trip_members.trip_id and t.created_by = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Saved places: attribution must be the caller
-- ---------------------------------------------------------------------------
drop policy if exists "Trip members can add saved places" on public.saved_places;
create policy "Trip members can add saved places" on public.saved_places
  for insert with check (
    added_by = auth.uid() and public.is_trip_member(trip_id, auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Votes: only on places in your own trips
-- ---------------------------------------------------------------------------
create or replace function public.can_vote_on_place(lookup_place_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.saved_places sp
    where sp.id = lookup_place_id and public.is_trip_member(sp.trip_id, auth.uid())
  );
$$;

drop policy if exists "Users can upsert their own vote" on public.votes;
create policy "Users can upsert their own vote" on public.votes
  for insert with check (
    auth.uid() = user_id and public.can_vote_on_place(place_id)
  );

drop policy if exists "Users can update their own vote" on public.votes;
create policy "Users can update their own vote" on public.votes
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id and public.can_vote_on_place(place_id));

-- ---------------------------------------------------------------------------
-- Profiles: self + trip-mates, no email column for other clients
-- ---------------------------------------------------------------------------
create or replace function public.shares_trip_with(other_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.trip_members me
    join public.trip_members them on them.trip_id = me.trip_id
    where me.user_id = auth.uid() and them.user_id = other_user_id
  );
$$;

drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
drop policy if exists "Profiles visible to self and trip-mates" on public.profiles;
create policy "Profiles visible to self and trip-mates" on public.profiles
  for select to authenticated using (
    id = auth.uid() or public.shares_trip_with(id)
  );

-- Column-level grant: email stays in the table (written by handle_new_user)
-- but API clients can no longer select it. Users read their own email from
-- the auth session instead.
revoke select on public.profiles from anon, authenticated;
grant select (id, display_name, avatar_url, created_at) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: images only, 5 MB max, uploads scoped to trips you belong to
-- ---------------------------------------------------------------------------
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
where id = 'photos';

drop policy if exists "Authenticated users can upload photos" on storage.objects;
drop policy if exists "Trip members can upload trip photos" on storage.objects;
create policy "Trip members can upload trip photos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'places'
    -- CASE guards the cast: AND operands have no guaranteed evaluation order.
    and public.is_trip_member(
      case
        when (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then ((storage.foldername(name))[2])::uuid
      end,
      auth.uid()
    )
  );
