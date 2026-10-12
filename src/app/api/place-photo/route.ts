import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createRateLimiter, TtlCache } from "@/lib/rateLimit";
import { findPlacePhotos, type PhotoCandidate } from "@/lib/placePhotos";

export type { PhotoCandidate };

const isRateLimited = createRateLimiter(20, 60 * 1000);
const resultCache = new TtlCache<PhotoCandidate[]>(24 * 60 * 60 * 1000);

function parseCoord(raw: string | null, limit: number) {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const name = (params.get("name") ?? "").trim().slice(0, 200);
  const lat = parseCoord(params.get("lat"), 90);
  const lng = parseCoord(params.get("lng"), 180);
  const hasPin = lat !== null && lng !== null;
  if (name.length < 2 && !hasPin) return Response.json([]);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json([], { status: 401 });

  // Rounded to ~100 m so tiny pin differences share a cache entry.
  const cacheKey = `${name.toLowerCase()}|${hasPin ? `${lat!.toFixed(3)},${lng!.toFixed(3)}` : ""}`;
  const cached = resultCache.get(cacheKey);
  if (cached) return Response.json(cached);
  if (isRateLimited(user.id)) return Response.json([], { status: 429 });

  const results = await findPlacePhotos({ name, lat: hasPin ? lat : null, lng: hasPin ? lng : null });
  if (results.length > 0) resultCache.set(cacheKey, results);
  return Response.json(results);
}
