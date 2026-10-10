"use client";

import { useState } from "react";
import type { createClient } from "./supabase/client";
import type { Trip, TravelMode } from "./types";

/**
 * The trip's travel mode with an optimistic setter. Saved through
 * set_travel_mode() because trip updates are owner-only (migration 006).
 */
export function useTravelMode(trip: Trip, supabase: ReturnType<typeof createClient>) {
  const serverMode: TravelMode = trip.travel_mode ?? "walk";
  const [mode, setMode] = useState<TravelMode>(serverMode);
  // Follow changes made elsewhere (e.g. another member, picked up by sync).
  const [lastServerMode, setLastServerMode] = useState(serverMode);
  if (serverMode !== lastServerMode) {
    setLastServerMode(serverMode);
    setMode(serverMode);
  }

  async function changeMode(next: TravelMode) {
    if (next === mode) return;
    setMode(next);
    // On error the local choice stays; the next sync brings back the saved mode.
    await supabase.rpc("set_travel_mode", { p_trip_id: trip.id, p_mode: next });
  }

  return [mode, changeMode] as const;
}
