"use client";

import { useEffect, useState } from "react";
import { estimateLeg, type Leg, type LngLat } from "./travel";
import type { TravelMode } from "./types";

const MAX_POINTS = 25;

// Routes for sequences already fetched this session, so flipping between days
// or modes doesn't refetch.
const clientCache = new Map<string, Leg[]>();

async function fetchLegs(tripId: string, mode: TravelMode, coords: LngLat[]): Promise<Leg[] | null> {
  try {
    const res = await fetch("/api/route-legs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tripId, mode, coords }),
    });
    if (!res.ok) return null;
    const { legs } = (await res.json()) as { legs?: Leg[] };
    return legs && legs.length === coords.length - 1 ? legs : null;
  } catch {
    return null;
  }
}

export interface RouteLegs {
  /** legs[i] is the trip from stop i to stop i+1; null when either has no coordinates. */
  legs: (Leg | null)[];
  /** True once the routing API's figures have replaced the estimates. */
  exact: boolean;
}

/**
 * Travel legs between consecutive stops. Returns straight-line estimates
 * immediately and swaps in routed times once /api/route-legs answers.
 */
export function useRouteLegs(tripId: string, mode: TravelMode, points: (LngLat | null)[]): RouteLegs {
  // Only stops with coordinates are routed; a leg is kept only when both of
  // its ends are adjacent in the original order.
  const routed = points
    .map((p, index) => (p ? { p, index } : null))
    .filter((x): x is { p: LngLat; index: number } => x !== null)
    .slice(0, MAX_POINTS);
  const coords = routed.map((r) => r.p);
  const key = coords.length >= 2 ? `${mode}|${coords.map((c) => c.join(",")).join(";")}` : "";

  const [fetched, setFetched] = useState<{ key: string; legs: Leg[] } | null>(null);

  useEffect(() => {
    if (!key || clientCache.has(key)) return;
    const [keyMode, path] = key.split("|");
    const keyCoords = path.split(";").map((c) => c.split(",").map(Number) as LngLat);
    let cancelled = false;
    fetchLegs(tripId, keyMode as TravelMode, keyCoords).then((legs) => {
      if (!legs) return;
      clientCache.set(key, legs);
      if (!cancelled) setFetched({ key, legs });
    });
    return () => {
      cancelled = true;
    };
  }, [tripId, key]);

  const exactLegs = key ? (fetched?.key === key ? fetched.legs : clientCache.get(key)) : undefined;

  const legs: (Leg | null)[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) {
      legs.push(null);
      continue;
    }
    const r = routed.findIndex((x) => x.index === i);
    const exact = exactLegs && r >= 0 && routed[r + 1]?.index === i + 1 ? exactLegs[r] : undefined;
    legs.push(exact ?? estimateLeg(a, b, mode));
  }
  return { legs, exact: !!exactLegs };
}
