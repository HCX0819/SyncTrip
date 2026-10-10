import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isGeocodableQuery } from "@/lib/geocode";
import { createRateLimiter, TtlCache } from "@/lib/rateLimit";
import {
  getToken,
  resolveBias,
  searchMapbox,
  searchNominatim,
  type Bias,
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
  const search = token
    ? (bias: Bias | null) => searchMapbox(q, token, bias)
    : (bias: Bias | null) => searchNominatim(q, bias);

  try {
    const bias = tripId && token ? await resolveBias(tripId, token) : null;
    // Proximity changes ranking, so two trips in the same country can't share results.
    const cacheKey = `${bias ? `${bias.country},${bias.lon},${bias.lat}` : ""}|${q.toLowerCase()}`;
    const cached = resultCache.get(cacheKey);
    if (cached) return Response.json(cached);

    let results = await search(bias);
    // A vague destination can resolve to the wrong country; don't let it hide everything.
    if (results.length === 0 && bias) results = await search(null);
    if (results.length > 0) resultCache.set(cacheKey, results);
    return Response.json(results);
  } catch {
    return Response.json([], { status: 502 });
  }
}
