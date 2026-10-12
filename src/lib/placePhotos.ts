// Server-only: finds photos of a place so users don't have to hunt for one.
// Sources, best first:
//   1. Google Places photos, only when GOOGLE_PLACES_KEY is set (paid, best
//      coverage for restaurants and hotels).
//   2. Wikipedia article images, matched by name and checked against the pin.
//   3. Wikimedia Commons photos taken near the pin.
// All sources are best effort: a failure just yields fewer candidates.

export interface PhotoCandidate {
  /** Displayable image URL (for Google, our own proxy route). */
  url: string;
  source: "google" | "wikipedia" | "commons";
  /** Who to credit, shown under the suggestion. */
  credit: string;
  creditUrl: string | null;
}

export interface PhotoQuery {
  name: string;
  lat: number | null;
  lng: number | null;
}

const TIMEOUT_MS = 4000;
const THUMB_WIDTH = 800;
const MAX_CANDIDATES = 6;
// Wikimedia asks API clients to identify themselves.
const WIKI_HEADERS = { "User-Agent": "SyncTrip/1.0 (travel planning PWA)" };
// A name match further than this from the pin is probably a different place.
const MAX_MATCH_KM = 25;
const NEARBY_RADIUS_M = 300;

export function getGooglePlacesKey() {
  return process.env.GOOGLE_PLACES_KEY || null;
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

// Japanese and Chinese names are best matched on their own Wikipedias.
function wikiLanguages(name: string) {
  if (/[぀-ヿ]/.test(name)) return ["ja", "en"];
  if (/[㐀-䶿一-鿿]/.test(name)) return ["zh", "en"];
  return ["en"];
}

function stripHtml(s: string) {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Wikipedia: article lead images
// ---------------------------------------------------------------------------

interface WikiPage {
  title: string;
  index?: number;
  thumbnail?: { source: string };
  coordinates?: { lat: number; lon: number }[];
}

async function searchWikipedia(q: PhotoQuery, lang: string): Promise<PhotoCandidate[]> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: q.name,
    gsrlimit: "5",
    prop: "pageimages|coordinates",
    piprop: "thumbnail",
    pithumbsize: String(THUMB_WIDTH),
  });
  const data = await getJson<{ query?: { pages?: Record<string, WikiPage> } }>(
    `https://${lang}.wikipedia.org/w/api.php?${params}`,
    { headers: WIKI_HEADERS }
  );
  const pages = Object.values(data?.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

  return pages
    .filter((p) => {
      if (!p.thumbnail) return false;
      // With a pin, only trust articles that are actually near it; without
      // one, only the top hit (a search for "Sunrise Cafe" matches anything).
      const c = p.coordinates?.[0];
      if (q.lat !== null && q.lng !== null) {
        return !!c && distanceKm(q.lat, q.lng, c.lat, c.lon) <= MAX_MATCH_KM;
      }
      return p === pages[0];
    })
    .map((p) => ({
      url: p.thumbnail!.source,
      source: "wikipedia" as const,
      credit: `Wikipedia · ${p.title}`,
      creditUrl: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, "_"))}`,
    }));
}

// ---------------------------------------------------------------------------
// Wikimedia Commons: photos geotagged near the pin
// ---------------------------------------------------------------------------

interface CommonsPage {
  title: string;
  index?: number;
  imageinfo?: {
    thumburl?: string;
    mime?: string;
    descriptionurl?: string;
    extmetadata?: { Artist?: { value: string }; LicenseShortName?: { value: string } };
  }[];
}

async function searchCommonsNearby(lat: number, lng: number): Promise<PhotoCandidate[]> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "geosearch",
    ggsnamespace: "6",
    ggscoord: `${lat}|${lng}`,
    ggsradius: String(NEARBY_RADIUS_M),
    ggslimit: "10",
    prop: "imageinfo",
    iiprop: "url|mime|extmetadata",
    iiurlwidth: String(THUMB_WIDTH),
    iiextmetadatafilter: "Artist|LicenseShortName",
  });
  const data = await getJson<{ query?: { pages?: Record<string, CommonsPage> } }>(
    `https://commons.wikimedia.org/w/api.php?${params}`,
    { headers: WIKI_HEADERS }
  );

  return Object.values(data?.query?.pages ?? {})
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .flatMap((p) => {
      const info = p.imageinfo?.[0];
      // Skip maps, diagrams and documents (SVG, PDF, TIFF scans).
      if (!info?.thumburl || !/^image\/(jpeg|png|webp)$/.test(info.mime ?? "")) return [];
      const artist = stripHtml(info.extmetadata?.Artist?.value ?? "");
      const license = info.extmetadata?.LicenseShortName?.value;
      const credit = [artist || "Wikimedia Commons", license].filter(Boolean).join(" · ");
      return [{ url: info.thumburl, source: "commons" as const, credit, creditUrl: info.descriptionurl ?? null }];
    });
}

// ---------------------------------------------------------------------------
// Google Places (optional)
// ---------------------------------------------------------------------------

interface GooglePlace {
  id: string;
  photos?: { authorAttributions?: { displayName?: string; uri?: string }[] }[];
}

async function searchGoogle(q: PhotoQuery, key: string): Promise<PhotoCandidate[]> {
  const body: Record<string, unknown> = { textQuery: q.name, pageSize: 1 };
  if (q.lat !== null && q.lng !== null) {
    body.locationBias = { circle: { center: { latitude: q.lat, longitude: q.lng }, radius: 2000 } };
  }
  const data = await getJson<{ places?: GooglePlace[] }>("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.id,places.photos",
    },
    body: JSON.stringify(body),
  });
  const place = data?.places?.[0];
  if (!place?.photos) return [];

  // Google's terms allow storing the place id but not photo names or images,
  // so the saved URL points at our proxy, which looks the photo up fresh.
  return place.photos.slice(0, 4).map((photo, i) => {
    const author = photo.authorAttributions?.[0];
    return {
      url: `/api/place-photo/google?place=${encodeURIComponent(place.id)}&i=${i}`,
      source: "google" as const,
      credit: author?.displayName ? `${author.displayName} · Google` : "Google",
      creditUrl: author?.uri ?? null,
    };
  });
}

/** Resolves a Google place's photo to a short-lived, key-free image URL. */
export async function resolveGooglePhoto(placeId: string, index: number, key: string) {
  const place = await getJson<{ photos?: { name: string }[] }>(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    { headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "photos" } }
  );
  const name = place?.photos?.[index]?.name;
  if (!name) return null;
  const media = await getJson<{ photoUri?: string }>(
    `https://places.googleapis.com/v1/${name}/media?maxWidthPx=${THUMB_WIDTH}&skipHttpRedirect=true`,
    { headers: { "X-Goog-Api-Key": key } }
  );
  return media?.photoUri ?? null;
}

// ---------------------------------------------------------------------------

export async function findPlacePhotos(q: PhotoQuery): Promise<PhotoCandidate[]> {
  const key = getGooglePlacesKey();
  const hasPin = q.lat !== null && q.lng !== null;

  const lookups: Promise<PhotoCandidate[]>[] = [
    key && q.name ? searchGoogle(q, key) : Promise.resolve([]),
    ...(q.name ? wikiLanguages(q.name).map((lang) => searchWikipedia(q, lang)) : []),
    hasPin ? searchCommonsNearby(q.lat!, q.lng!) : Promise.resolve([]),
  ];
  const results = await Promise.all(lookups.map((p) => p.catch(() => [])));

  const seen = new Set<string>();
  return results
    .flat()
    .filter((c) => !seen.has(c.url) && seen.add(c.url))
    .slice(0, MAX_CANDIDATES);
}
