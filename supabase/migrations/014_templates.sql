-- Trip templates.
-- 1. duplicate_trip() copies a trip the caller belongs to into a fresh trip
--    they own: details, places (no votes or comments) and the itinerary.
-- 2. Owners can flag a trip as a public template (trips.is_public_template).
--    Any signed-in user can browse templates through list_templates() and
--    get_template(), which return only display fields (never notes, members,
--    invite tokens or created_by), and copy one with use_template().
-- Place photos keep pointing at the source trip's files. The photos bucket is
-- public-read (001), so the copy's members can still load them.

alter table public.trips
  add column if not exists is_public_template boolean not null default false;

-- 006 limits direct trip updates to a column list; the owner-only update
-- policy still applies to this one.
grant update (is_public_template) on public.trips to authenticated;

-- ---------------------------------------------------------------------------
-- Copying a trip (internal)
-- ---------------------------------------------------------------------------
-- Creates a new trip owned by p_user from p_source and returns its id.
-- With p_start_date the copy keeps the source's length (from its dates, or
-- from its last itinerary day when it has no dates); without it the copy is
-- undated. Not callable by API clients: the public RPCs below check access.
create or replace function public.copy_trip_internal(
  p_source uuid,
  p_name text,
  p_start_date date,
  p_user uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src public.trips;
  v_new_id uuid;
  v_end date;
  v_max_day int;
  v_time_cols text;
  v_time_vals text;
begin
  select * into v_src from public.trips where id = p_source;
  if v_src.id is null then
    raise exception 'Trip not found';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'Trip name is required';
  end if;

  if p_start_date is not null then
    if v_src.start_date is not null and v_src.end_date is not null then
      v_end := p_start_date + (v_src.end_date - v_src.start_date);
    else
      select max(day_index) into v_max_day
      from public.itinerary_items where trip_id = p_source;
      if v_max_day > 1 then
        v_end := p_start_date + (v_max_day - 1);
      end if;
    end if;
  end if;

  insert into public.trips (name, destination, start_date, end_date, cover_url, created_by)
  values (trim(p_name), v_src.destination, p_start_date, v_end, v_src.cover_url, p_user)
  returning id into v_new_id;

  insert into public.trip_members (trip_id, user_id, role)
  values (v_new_id, p_user, 'owner');

  -- Item times come from migration 010; copy whichever of them exist so this
  -- works with or without it.
  select
    coalesce(string_agg(', ' || quote_ident(column_name), '' order by column_name), ''),
    coalesce(string_agg(', i.' || quote_ident(column_name), '' order by column_name), '')
  into v_time_cols, v_time_vals
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'itinerary_items'
    and column_name in ('start_time', 'end_time');

  -- Places get new ids up front so itinerary items can be pointed at the
  -- copies in the same statement. created_at is shifted rather than reset so
  -- the copies keep their relative order (all at or before now()).
  execute format($sql$
    with src as materialized (
      select sp.id as old_id,
             gen_random_uuid() as new_id,
             sp.title, sp.category, sp.source_url, sp.photo_url, sp.note,
             sp.latitude, sp.longitude, sp.address,
             now() - (max(sp.created_at) over () - sp.created_at) as created_at
      from public.saved_places sp
      where sp.trip_id = $1
    ),
    copied as (
      insert into public.saved_places
        (id, trip_id, added_by, title, category, source_url, photo_url, note,
         latitude, longitude, address, created_at)
      select new_id, $2, $3, title, category, source_url, photo_url, note,
             latitude, longitude, address, created_at
      from src
      returning id
    )
    insert into public.itinerary_items (trip_id, place_id, day_index, sort_order%1$s)
    select $2, src.new_id, i.day_index, i.sort_order%2$s
    from public.itinerary_items i
    join src on src.old_id = i.place_id
    where i.trip_id = $1
  $sql$, v_time_cols, v_time_vals)
  using p_source, v_new_id, p_user;

  -- The copy's activity triggers logged every place and itinerary row above;
  -- start the new trip with an empty feed instead.
  delete from public.trip_activity where trip_id = v_new_id;

  -- TODO: copy checklist_items (migration 013), reset to not done.

  return v_new_id;
end;
$$;

revoke execute on function public.copy_trip_internal(uuid, text, date, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------
create or replace function public.duplicate_trip(p_trip_id uuid, p_name text, p_start_date date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_trip_member(p_trip_id, auth.uid()) then
    raise exception 'Not a member of this trip' using errcode = '42501';
  end if;

  return public.copy_trip_internal(p_trip_id, p_name, p_start_date, auth.uid());
end;
$$;

create or replace function public.use_template(p_trip_id uuid, p_name text, p_start_date date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.trips where id = p_trip_id and is_public_template
  ) then
    raise exception 'Template not found' using errcode = '42501';
  end if;

  v_new_id := public.copy_trip_internal(p_trip_id, p_name, p_start_date, auth.uid());

  -- Notes are private to the template's members (get_template never shows
  -- them), so strangers' copies don't get them either.
  update public.saved_places set note = null where trip_id = v_new_id;

  return v_new_id;
end;
$$;

-- Days come from the trip dates or the last itinerary day, whichever is
-- larger; null when the template has neither.
create or replace function public.list_templates()
returns table (
  id uuid,
  name text,
  destination text,
  day_count int,
  place_count int,
  cover_url text
)
language sql
security definer
set search_path = public
stable
as $$
  select t.id,
         t.name,
         t.destination,
         greatest(
           t.end_date - t.start_date + 1,
           (select max(i.day_index) from public.itinerary_items i where i.trip_id = t.id)
         ),
         (select count(*)::int from public.saved_places sp where sp.trip_id = t.id),
         t.cover_url
  from public.trips t
  where t.is_public_template and auth.uid() is not null
  order by t.created_at desc;
$$;

-- One template with its places as JSON, or null if it isn't public. A place
-- appears once per itinerary slot, or once with a null day_index if it isn't
-- scheduled.
create or replace function public.get_template(p_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'id', l.id,
    'name', l.name,
    'destination', l.destination,
    'day_count', l.day_count,
    'place_count', l.place_count,
    'cover_url', l.cover_url,
    'places', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'title', sp.title,
          'category', sp.category,
          'address', sp.address,
          'photo_url', sp.photo_url,
          'latitude', sp.latitude,
          'longitude', sp.longitude,
          'day_index', i.day_index,
          'sort_order', i.sort_order
        )
        order by i.day_index nulls last, i.sort_order, sp.created_at
      )
      from public.saved_places sp
      left join public.itinerary_items i on i.place_id = sp.id and i.trip_id = sp.trip_id
      where sp.trip_id = l.id
    ), '[]'::jsonb)
  )
  from public.list_templates() l
  where l.id = p_id;
$$;

revoke execute on function public.duplicate_trip(uuid, text, date) from public, anon;
revoke execute on function public.use_template(uuid, text, date) from public, anon;
revoke execute on function public.list_templates() from public, anon;
revoke execute on function public.get_template(uuid) from public, anon;
grant execute on function public.duplicate_trip(uuid, text, date) to authenticated;
grant execute on function public.use_template(uuid, text, date) to authenticated;
grant execute on function public.list_templates() to authenticated;
grant execute on function public.get_template(uuid) to authenticated;
