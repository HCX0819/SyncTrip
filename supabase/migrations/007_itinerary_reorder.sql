-- Itinerary reordering.
-- reorder_itinerary_day() writes the full order of one day in a single call:
-- every id in p_item_ids is moved to p_day_index and given sort_order equal to
-- its 1-based position in the array. Dragging a card to another day is the
-- same call with the destination day's new order (including the moved card).
-- Ids that don't belong to p_trip_id are ignored.

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
end;
$$;

revoke execute on function public.reorder_itinerary_day(uuid, int, uuid[]) from public, anon;
grant execute on function public.reorder_itinerary_day(uuid, int, uuid[]) to authenticated;
