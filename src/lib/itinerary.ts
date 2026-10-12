// Itinerary writes shared by the Itinerary and Map tabs, so both order and
// insert items the same way.
import type { createClient } from "./supabase/client";
import { tripDayCount, tripDayDate } from "./dates";
import type { ItineraryItem, Trip } from "./types";

type Supabase = ReturnType<typeof createClient>;

export const ITINERARY_SELECT = "*, place:saved_places(*)";

export const bySortOrder = (a: ItineraryItem, b: ItineraryItem) =>
  a.sort_order - b.sort_order || a.id.localeCompare(b.id);

/** Number of days shown for a trip: 3 when dates are missing, capped at 30. */
export function tripTotalDays(trip: Pick<Trip, "start_date" | "end_date">): number {
  return Math.max(1, Math.min(tripDayCount(trip.start_date, trip.end_date) ?? 3, 30));
}

/** "Day 2 · Wed, Jan 7", or "Day 2" without a start date. */
export function dayLabel(startDate: string | null | undefined, day: number): string {
  const date = tripDayDate(startDate, day);
  return date
    ? `Day ${day} · ${date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`
    : `Day ${day}`;
}

/**
 * Moves an item to the end of `targetDay`. Returns the updated items and the
 * target day's new order (for saveDayOrder), or null when nothing changes.
 */
export function planMoveToDay(
  items: ItineraryItem[],
  itemId: string,
  targetDay: number
): { next: ItineraryItem[]; orderedIds: string[] } | null {
  const item = items.find((i) => i.id === itemId);
  if (!item || item.day_index === targetDay) return null;
  const targetIds = items
    .filter((i) => i.day_index === targetDay)
    .sort(bySortOrder)
    .map((i) => i.id);
  const orderedIds = [...targetIds, itemId];
  const position = new Map(orderedIds.map((id, idx) => [id, idx + 1]));
  const next = items.map((i) =>
    position.has(i.id) ? { ...i, day_index: targetDay, sort_order: position.get(i.id)! } : i
  );
  return { next, orderedIds };
}

/** Saves the order of one day; items listed from other days move onto it. */
export async function saveDayOrder(supabase: Supabase, tripId: string, day: number, orderedIds: string[]) {
  const { error } = await supabase.rpc("reorder_itinerary_day", {
    p_trip_id: tripId,
    p_day_index: day,
    p_item_ids: orderedIds,
  });
  return error;
}

/** Appends a place to the end of `day`. */
export async function addPlaceToDay(
  supabase: Supabase,
  tripId: string,
  placeId: string,
  day: number,
  items: ItineraryItem[]
): Promise<ItineraryItem | null> {
  const nextSortOrder =
    items.filter((i) => i.day_index === day).reduce((max, i) => Math.max(max, i.sort_order), 0) + 1;
  const { data, error } = await supabase
    .from("itinerary_items")
    .insert({ trip_id: tripId, place_id: placeId, day_index: day, sort_order: nextSortOrder })
    .select(ITINERARY_SELECT)
    .single();
  return error || !data ? null : (data as ItineraryItem);
}
