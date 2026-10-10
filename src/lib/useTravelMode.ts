"use client";

import { useState } from "react";
import type { createClient } from "./supabase/client";
import type { Trip, TravelMode } from "./types";

/**
 * The trip's travel mode with an optimistic setter. Only owners can update
 * trips (migration 006); for other members the choice still applies locally
 * but isn't saved.
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
    // Errors and RLS-filtered updates (non-owners) leave the local choice in place.
    await supabase.from("trips").update({ travel_mode: next }).eq("id", trip.id);
  }

  return [mode, changeMode] as const;
}
