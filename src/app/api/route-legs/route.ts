import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createRateLimiter, TtlCache } from "@/lib/rateLimit";
import { speedSeconds, type Leg, type LngLat } from "@/lib/travel";
import type { TravelMode } from "@/lib/types";

// Mapbox Directions accepts up to 25 waypoints per request.
const MAX_POINTS = 25;

const isRateLimited = createRateLimiter(30, 60 * 1000);
const legCache = new TtlCache<Leg[]>(24 * 60 * 60 * 1000);

interface DirectionsResponse {
  code?: string;
  routes?: { legs: { duration: number; distance: number }[] }[];
}

function getToken() {
  const token = process.env.MAPBOX_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  return token?.startsWith("pk.") && !token.includes("placeholder") ? token : null;
}

function isLngLat(value: unknown): value is LngLat {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Math.abs(value[0]) <= 180 &&
    Math.abs(value[1]) <= 90
  );
}

function toLegs(data: DirectionsResponse, expected: number): Leg[] | null {
  const legs = data.routes?.[0]?.legs;
  if (!legs || legs.length !== expected) return null;
  return legs.map((l) => ({ seconds: l.duration, meters: l.distance }));
}

async function routeMapbox(coords: LngLat[], mode: TravelMode, token: string): Promise<Leg[] | null> {
  const profile = mode === "walk" ? "walking" : "driving";
  const path = coords.map(([lng, lat]) => `${lng},${lat}`).join(";");
  const res = await fetch(
    `https://api.mapbox.com/directions/v5/mapbox/${profile}/${path}?overview=false&access_token=${token}`
  );
  if (!res.ok) return null;
  return toLegs((await res.json()) as DirectionsResponse, coords.length - 1);
}

// The public OSRM demo server only routes cars, so walking times are derived
// from the road distance at walking speed.
async function routeOsrm(coords: LngLat[], mode: TravelMode): Promise<Leg[] | null> {
  const path = coords.map(([lng, lat]) => `${lng},${lat}`).join(";");
  const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${path}?overview=false`, {
    headers: { "User-Agent": "SyncTrip/1.0 (travel planning PWA)" },
  });
  if (!res.ok) return null;
  const legs = toLegs((await res.json()) as DirectionsResponse, coords.length - 1);
  if (!legs || mode === "drive") return legs;
  return legs.map((l) => ({ meters: l.meters, seconds: speedSeconds(l.meters, "walk") }));
}

export async function POST(request: NextRequest) {
  let body: { tripId?: unknown; mode?: unknown; coords?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tripId = typeof body.tripId === "string" ? body.tripId : "";
  const mode: TravelMode | null = body.mode === "walk" || body.mode === "drive" ? body.mode : null;
  const coords = Array.isArray(body.coords) && body.coords.every(isLngLat) ? body.coords : null;
  if (!tripId || !mode || !coords || coords.length < 2 || coords.length > MAX_POINTS) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("trip_members")
    .select("id")
    .eq("trip_id", tripId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return Response.json({ error: "Forbidden" }, { status: 403 });

  // ~1 m precision is plenty and lets tiny float differences share an entry.
  const cacheKey = `${mode}|${coords.map(([lng, lat]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join(";")}`;
  const cached = legCache.get(cacheKey);
  if (cached) return Response.json({ legs: cached });

  if (isRateLimited(user.id)) return Response.json({ error: "Too many requests" }, { status: 429 });

  try {
    const token = getToken();
    const legs = token ? await routeMapbox(coords, mode, token) : await routeOsrm(coords, mode);
    if (!legs) return Response.json({ error: "No route" }, { status: 502 });
    legCache.set(cacheKey, legs);
    return Response.json({ legs });
  } catch {
    return Response.json({ error: "Routing failed" }, { status: 502 });
  }
}
