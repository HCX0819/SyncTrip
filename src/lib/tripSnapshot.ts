// Offline copies of trip data in localStorage, written after successful loads
// and read back when a fetch fails while offline. Kept out of the service
// worker on purpose so authenticated Supabase responses are never cached
// there. Every storage access is wrapped: localStorage can be missing, full or
// blocked (private mode), and a broken snapshot must never break the page.
// Call only from effects and event handlers, never during render.
import type { ItineraryItem, SavedPlace, Trip, TripMember } from "./types";

const PREFIX = "synctrip:trip:";

export interface TripSnapshotData {
  trip: Trip;
  members: TripMember[];
  places: SavedPlace[];
  items: ItineraryItem[];
}

export type TripSnapshot = Partial<TripSnapshotData> & {
  /** ISO time of the latest write. */
  savedAt: string;
  /** ISO time each part was last written (parts are saved independently). */
  updated: Partial<Record<keyof TripSnapshotData, string>>;
};

export function loadTripSnapshot(tripId: string): TripSnapshot | null {
  try {
    const raw = localStorage.getItem(PREFIX + tripId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TripSnapshot;
    if (!parsed || typeof parsed.savedAt !== "string") return null;
    return { ...parsed, updated: parsed.updated ?? {} };
  } catch {
    return null;
  }
}

/** Merges `data` into the trip's snapshot, stamping each part with the current time. */
export function saveTripSnapshot(tripId: string, data: Partial<TripSnapshotData>): void {
  try {
    const now = new Date().toISOString();
    const previous = loadTripSnapshot(tripId);
    const updated = { ...(previous?.updated ?? {}) };
    for (const key of Object.keys(data) as (keyof TripSnapshotData)[]) updated[key] = now;
    const next: TripSnapshot = { ...previous, ...data, savedAt: now, updated };
    localStorage.setItem(PREFIX + tripId, JSON.stringify(next));
  } catch {
    // Quota exceeded or storage unavailable — offline mode just won't have this trip.
  }
}

/** Removes every trip snapshot (call on sign-out so the next user can't see them). */
export function clearTripSnapshots(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

/** "Oct 10, 3:45 PM" for the "Offline — saved …" note. */
export function formatSavedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "earlier";
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
