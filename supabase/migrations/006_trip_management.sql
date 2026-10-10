-- Trip management.
-- 1. Ownership is decided by trip_members.role = 'owner' (not trips.created_by),
--    so it can be handed over when the owner leaves.
-- 2. Owners can edit and delete their trip; deleting cascades to members,
--    places, votes and itinerary items.
-- 3. Members leave, and owners remove members, through RPCs. There is still
--    no DELETE policy on trip_members.
-- 4. Users can delete their own account.

-- ---------------------------------------------------------------------------
-- Ownership helper
-- ---------------------------------------------------------------------------
create or replace function public.is_trip_owner(lookup_trip_id uuid, lookup_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = lookup_trip_id and user_id = lookup_user_id and role = 'owner'
  );
$$;

revoke execute on function public.is_trip_owner(uuid, uuid) from public, anon;
grant execute on function public.is_trip_owner(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Trips: owner-only update and delete
-- ---------------------------------------------------------------------------
drop policy if exists "Trip owners can update trips" on public.trips;
create policy "Trip owners can update trips" on public.trips
  for update using (public.is_trip_owner(id, auth.uid()))
  with check (public.is_trip_owner(id, auth.uid()));

drop policy if exists "Trip owners can delete trips" on public.trips;
create policy "Trip owners can delete trips" on public.trips
  for delete using (public.is_trip_owner(id, auth.uid()));

-- Only the editable details can be changed directly. created_by feeds the
-- "Trip creator can add self as owner" insert policy and invite_token is
-- rotated through rotate_invite_token(), so neither is client-writable.
revoke update on public.trips from anon, authenticated;
grant update (name, destination, start_date, end_date, cover_url) on public.trips to authenticated;

-- Same idea for profiles: users edit their name and avatar, nothing else.
revoke update on public.profiles from anon, authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Leaving a trip (internal)
-- ---------------------------------------------------------------------------
-- Removes p_user_id from p_trip_id. If they were the owner, the remaining
-- member who joined first becomes owner; if nobody is left the trip is
-- deleted. Returns 'left' | 'transferred' | 'deleted'.
-- Not callable by API clients: the public RPCs below do the permission checks.
create or replace function public.remove_trip_member_internal(p_trip_id uuid, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.member_role;
  v_new_owner uuid;
begin
  -- Serialise concurrent leaves on the same trip so it never ends up ownerless.
  perform 1 from public.trips where id = p_trip_id for update;
  if not found then
    raise exception 'Trip not found';
  end if;

  delete from public.trip_members
  where trip_id = p_trip_id and user_id = p_user_id
  returning role into v_role;

  if v_role is null then
    raise exception 'Not a member of this trip';
  end if;

  if not exists (select 1 from public.trip_members where trip_id = p_trip_id) then
    delete from public.trips where id = p_trip_id;
    return 'deleted';
  end if;

  if v_role = 'owner' and not exists (
    select 1 from public.trip_members where trip_id = p_trip_id and role = 'owner'
  ) then
    select user_id into v_new_owner
    from public.trip_members
    where trip_id = p_trip_id
    order by joined_at, id
    limit 1;

    update public.trip_members set role = 'owner'
    where trip_id = p_trip_id and user_id = v_new_owner;
  end if;

  -- A former creator must not keep read access or be able to re-add
  -- themselves as owner via the creator insert policy.
  update public.trips
  set created_by = coalesce(
    v_new_owner,
    (select user_id from public.trip_members
     where trip_id = p_trip_id and role = 'owner'
     order by joined_at, id limit 1)
  )
  where id = p_trip_id and created_by = p_user_id;

  return case when v_new_owner is not null then 'transferred' else 'left' end;
end;
$$;

revoke execute on function public.remove_trip_member_internal(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------
create or replace function public.leave_trip(p_trip_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_trip_member(p_trip_id, auth.uid()) then
    raise exception 'Not a member of this trip';
  end if;

  return public.remove_trip_member_internal(p_trip_id, auth.uid());
end;
$$;

create or replace function public.remove_member(p_trip_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_trip_owner(p_trip_id, auth.uid()) then
    raise exception 'Only the trip owner can remove members';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Use leave_trip to leave your own trip';
  end if;

  perform public.remove_trip_member_internal(p_trip_id, p_user_id);
end;
$$;

-- Leaves every trip (handing over or deleting owned trips) and then deletes
-- the auth user, which cascades to profiles, memberships and votes.
-- NOTE: this relies on the function owner (postgres) having DELETE on
-- auth.users. That is the default on Supabase, but verify it on the target
-- project before shipping (e.g. run it once for a throwaway account).
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_trip_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  for v_trip_id in
    select trip_id from public.trip_members where user_id = v_uid
  loop
    perform public.remove_trip_member_internal(v_trip_id, v_uid);
  end loop;

  delete from auth.users where id = v_uid;
end;
$$;

revoke execute on function public.leave_trip(uuid) from public, anon;
revoke execute on function public.remove_member(uuid, uuid) from public, anon;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.leave_trip(uuid) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
