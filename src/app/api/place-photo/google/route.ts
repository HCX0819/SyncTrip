import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createRateLimiter, TtlCache } from "@/lib/rateLimit";
import { getGooglePlacesKey, resolveGooglePhoto } from "@/lib/placePhotos";

// Saved places store this route's URL rather than a Google image URL, because
// Google's photo URLs expire and its terms don't allow keeping copies. Each
// request resolves a fresh, key-free image URL and redirects to it.

const PLACE_ID_RE = /^[A-Za-z0-9_-]{10,300}$/;
// Google photo URLs stay valid for a while; reusing one avoids paying per view.
const URI_TTL_MS = 50 * 60 * 1000;
const uriCache = new TtlCache<string>(URI_TTL_MS, 2000);
const isRateLimited = createRateLimiter(120, 60 * 1000);

export async function GET(request: NextRequest) {
  const placeId = request.nextUrl.searchParams.get("place") ?? "";
  const index = Number(request.nextUrl.searchParams.get("i") ?? "0");
  const key = getGooglePlacesKey();
  if (!key || !PLACE_ID_RE.test(placeId) || !Number.isInteger(index) || index < 0 || index > 9) {
    return new Response(null, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response(null, { status: 401 });

  const cacheKey = `${placeId}/${index}`;
  let uri = uriCache.get(cacheKey);
  if (!uri) {
    if (isRateLimited(user.id)) return new Response(null, { status: 429 });
    uri = (await resolveGooglePhoto(placeId, index, key)) ?? undefined;
    if (!uri) return new Response(null, { status: 404 });
    uriCache.set(cacheKey, uri);
  }

  return new Response(null, {
    status: 302,
    headers: { Location: uri, "Cache-Control": "private, max-age=3000" },
  });
}
