import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isGeocodableQuery } from "@/lib/geocode";
import { createRateLimiter, TtlCache } from "@/lib/rateLimit";
import {
  getToken,
  resolveBias,
  searchPlacesWithFallbacks,
  type GeocodeFeature,
} from "@/lib/geocodeSearch";

export type { GeocodeFeature };

const isRateLimited = createRateLimiter(30, 60 * 1000);
const resultCache = new TtlCache<GeocodeFeature[]>(24 * 60 * 60 * 1000);

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const tripId = request.nextUrl.searchParams.get("tripId")?.trim() ?? "";
  if (!isGeocodableQuery(q)) return Response.json([]);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json([], { status: 401 });
  if (isRateLimited(user.id)) return Response.json([], { status: 429 });

  const token = getToken();

  try {
    const bias = tripId && token ? await resolveBias(tripId, token) : null;
    // Proximity changes ranking, so two trips in the same country can't share results.
    const cacheKey = `${bias ? `${bias.country},${bias.lon},${bias.lat}` : ""}|${q.toLowerCase()}`;
    const cached = resultCache.get(cacheKey);
    if (cached) return Response.json(cached);

    const results = await searchPlacesWithFallbacks(q, token, bias);
    if (results.length > 0) resultCache.set(cacheKey, results);
    return Response.json(results);
  } catch {
    return Response.json([], { status: 502 });
  }
}
