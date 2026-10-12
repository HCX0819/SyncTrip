"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "./supabase/client";
import { ITINERARY_SELECT } from "./itinerary";
import { loadTripSnapshot, saveTripSnapshot } from "./tripSnapshot";
import type { ItineraryItem } from "./types";

/**
 * Read-mostly view of a trip's itinerary for screens other than the Itinerary
 * tab. Reloads when `syncTick` changes; offline, falls back to the snapshot.
 */
export function useItineraryItems(tripId: string, syncTick?: number) {
  const [supabase] = useState(() => createClient());
  const [items, setItems] = useState<ItineraryItem[]>([]);

  const reload = useCallback(async () => {
    const { data } = await supabase
      .from("itinerary_items")
      .select(ITINERARY_SELECT)
      .eq("trip_id", tripId)
      .order("sort_order", { ascending: true });
    if (data) {
      setItems(data as ItineraryItem[]);
      saveTripSnapshot(tripId, { items: data as ItineraryItem[] });
    } else if (!navigator.onLine) {
      const saved = loadTripSnapshot(tripId);
      if (saved?.items) setItems(saved.items);
    }
  }, [supabase, tripId]);

  useEffect(() => {
    // Initial load and every background sync; setState happens after the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload, syncTick]);

  return { items, setItems, reload, supabase };
}
