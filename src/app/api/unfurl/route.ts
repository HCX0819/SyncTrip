import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isGeocodableQuery } from "@/lib/geocode";
import { createRateLimiter } from "@/lib/rateLimit";
import { getToken, resolveBias, searchMapbox, searchNominatim, type Bias } from "@/lib/geocodeSearch";
import { safeFetch, SafeFetchError } from "@/lib/safeFetch";
import { guessCategory, unfurl, type UnfurlData } from "@/lib/unfurl";
import type { Category } from "@/lib/types";

// node:http, node:dns and Buffer are needed for the SSRF guard.
export const runtime = "nodejs";

export interface UnfurlResult {
  title: string | null;
  photoUrl: string | null;
  note: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  categoryGuess: Category;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Must match file_size_limit / allowed_mime_types on the "photos" bucket (migration 005).
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
};

// Each unfurl can make several outbound requests, so this is stricter than geocode.
const isRateLimited = createRateLimiter(10, 60 * 1000);

type ServerClient = Awaited<ReturnType<typeof createClient>>;

async function geocodeFirst(q: string, tripId: string) {
  if (!isGeocodableQuery(q)) return null;
  const token = getToken();
  const search = token
    ? (bias: Bias | null) => searchMapbox(q, token, bias)
    : (bias: Bias | null) => searchNominatim(q, bias);
  try {
    const bias = token ? await resolveBias(tripId, token) : null;
    let results = await search(bias);
    if (results.length === 0 && bias) results = await search(null);
    return results[0] ?? null;
  } catch {
    return null;
  }
}

// Social CDN image URLs expire, so keep our own copy. Same path rules as
// uploadTripPhoto; the user's own client, so storage policies still apply.
async function rehostPhoto(supabase: ServerClient, tripId: string, imageUrl: string) {
  try {
    const res = await safeFetch(imageUrl, { accept: "image/*", maxBytes: MAX_PHOTO_BYTES });
    const type = res.contentType.split(";")[0].trim().toLowerCase();
    const ext = PHOTO_TYPES[type];
    if (res.status < 200 || res.status >= 300 || !ext || res.body.length === 0) return null;

    const path = `places/${tripId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("photos").upload(path, res.body, { contentType: type });
    if (error) return null;
    return supabase.storage.from("photos").getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url")?.trim() ?? "";
  const tripId = request.nextUrl.searchParams.get("tripId")?.trim() ?? "";
  if (!raw || raw.length > 2048 || !UUID_RE.test(tripId)) {
    return Response.json({ error: "Missing link or trip." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  if (isRateLimited(user.id)) {
    return Response.json({ error: "Too many links at once — try again in a minute." }, { status: 429 });
  }

  const { data: membership } = await supabase
    .from("trip_members")
    .select("user_id")
    .eq("trip_id", tripId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return Response.json({ error: "Not a member of this trip." }, { status: 403 });

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return Response.json({ error: "That doesn't look like a link." }, { status: 400 });
  }

  let data: UnfurlData;
  try {
    data = await unfurl(url);
  } catch (err) {
    if (err instanceof SafeFetchError && err.kind === "blocked") {
      return Response.json({ error: err.message }, { status: 422 });
    }
    return Response.json({ error: "Couldn't read that link." }, { status: 502 });
  }

  let { address, lat, lng } = data;
  if ((lat === null || lng === null) && data.title) {
    const hit = await geocodeFirst(data.title, tripId);
    if (hit) {
      address = address ?? hit.place_name;
      lng = hit.geometry.coordinates[0];
      lat = hit.geometry.coordinates[1];
    }
  }

  const photoUrl = data.imageUrl ? await rehostPhoto(supabase, tripId, data.imageUrl) : null;

  const result: UnfurlResult = {
    title: data.title,
    photoUrl,
    note: data.note,
    address,
    lat,
    lng,
    categoryGuess: guessCategory(data.title, data.note),
  };
  return Response.json(result);
}
