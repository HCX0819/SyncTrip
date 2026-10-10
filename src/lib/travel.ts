import type { Category, TravelMode } from "./types";

/** [longitude, latitude], the order Mapbox and OSRM use. */
export type LngLat = [number, number];

export interface Leg {
  seconds: number;
  meters: number;
}

// Straight-line distance understates real routes; 1.3 is a common city average.
const DETOUR_FACTOR = 1.3;
const SPEED_KMH: Record<TravelMode, number> = { walk: 5, drive: 30 };

export const TRAVEL_MODE_ICON: Record<TravelMode, string> = { walk: "🚶", drive: "🚗" };

/** Typical time spent at a stop when it has no explicit times. */
export const DEFAULT_DWELL_MINUTES: Record<Category, number> = {
  eat: 75,
  do: 120,
  stay: 0,
  other: 60,
};

/** A day planned for longer than this gets a warning. */
export const OVERLOAD_MINUTES = 11 * 60;

export function haversineMeters([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Instant estimate shown until the routing API answers. */
export function estimateLeg(from: LngLat, to: LngLat, mode: TravelMode): Leg {
  const meters = haversineMeters(from, to) * DETOUR_FACTOR;
  return { meters, seconds: speedSeconds(meters, mode) };
}

/** Seconds to cover `meters` at the mode's average speed. */
export function speedSeconds(meters: number, mode: TravelMode): number {
  return (meters / 1000 / SPEED_KMH[mode]) * 3600;
}

/** "45 min", "1 h 20 min", "<1 min". */
export function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 1) return "<1 min";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** "0.9 km", "12 km". */
export function formatDistance(meters: number): string {
  const km = meters / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

/** "🚶 12 min · 0.9 km". */
export function formatLeg(leg: Leg, mode: TravelMode): string {
  return `${TRAVEL_MODE_ICON[mode]} ${formatDuration(leg.seconds)} · ${formatDistance(leg.meters)}`;
}

/** Minutes since midnight for a Postgres time ("09:30" or "09:30:00"), or null. */
export function parseTimeOfDay(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** "HH:MM" for an <input type="time"> from a Postgres time. */
export function toTimeInput(value: string | null | undefined): string {
  return value ? value.slice(0, 5) : "";
}

/** "9:30 AM"-style label for a Postgres time. */
export function formatTimeOfDay(value: string | null | undefined): string | null {
  const mins = parseTimeOfDay(value);
  if (mins === null) return null;
  const date = new Date(2000, 0, 1, Math.floor(mins / 60), mins % 60);
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export interface TimedStop {
  id: string;
  category: Category;
  start_time?: string | null;
  end_time?: string | null;
}

/** Explicit visit length when both times are set, otherwise the category default. */
export function dwellMinutes(stop: TimedStop): number {
  const start = parseTimeOfDay(stop.start_time);
  const end = parseTimeOfDay(stop.end_time);
  if (start !== null && end !== null && end > start) return end - start;
  return DEFAULT_DWELL_MINUTES[stop.category];
}

export interface DayLoad {
  travelMinutes: number;
  visitMinutes: number;
  /** Planned minutes for the day: travel + visits, or the span of explicit times if longer. */
  totalMinutes: number;
  overloaded: boolean;
  /** Ids of stops whose times overlap another stop's. */
  overlapping: Set<string>;
}

/**
 * Load for one day. `legs[i]` is the leg between stops i and i+1 (null when
 * unknown). A stop with only a start time is assumed to last its default
 * dwell when checking overlaps.
 */
export function computeDayLoad(stops: TimedStop[], legs: (Leg | null)[]): DayLoad {
  const travelMinutes = legs.reduce((sum, leg) => sum + (leg ? leg.seconds / 60 : 0), 0);
  const visitMinutes = stops.reduce((sum, s) => sum + dwellMinutes(s), 0);

  const intervals = stops
    .map((s) => {
      const start = parseTimeOfDay(s.start_time);
      if (start === null) return null;
      const end = parseTimeOfDay(s.end_time);
      return { id: s.id, start, end: end !== null && end > start ? end : start + dwellMinutes(s) };
    })
    .filter((i): i is { id: string; start: number; end: number } => i !== null)
    .sort((a, b) => a.start - b.start);

  const overlapping = new Set<string>();
  // Sorted by start, so each interval only needs checking against the
  // latest-ending one seen so far.
  let latest: { id: string; end: number } | null = null;
  for (const i of intervals) {
    if (latest && i.start < latest.end) {
      overlapping.add(i.id);
      overlapping.add(latest.id);
    }
    if (!latest || i.end > latest.end) latest = i;
  }

  const span = intervals.length
    ? Math.max(...intervals.map((i) => i.end)) - intervals[0].start
    : 0;
  const totalMinutes = Math.max(travelMinutes + visitMinutes, span);

  return {
    travelMinutes,
    visitMinutes,
    totalMinutes,
    overloaded: totalMinutes > OVERLOAD_MINUTES,
    overlapping,
  };
}
