import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isGeocodableQuery } from "@/lib/geocode";

export interface GeocodeFeature {
  id: string;
  place_name: string;
  text: string;
  geometry: { coordinates: [number, number] };
}

interface SearchBoxFeature {
  properties: {
    mapbox_id: string;
    name: string;
    full_address?: string;
    place_formatted?: string;
    coordinates: { longitude: number; latitude: number };
  };
}

interface GeocodeV6Feature {
  geometry: { coordinates: [number, number] };
  properties: { context?: { country?: { country_code?: string } } };
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  name?: string;
  lat: string;
  lon: string;
}

interface Bias {
  country: string;
  lon: number;
  lat: number;
}

const BIAS_TTL_MS = 10 * 60 * 1000;
const biasCache = new Map<string, { bias: Bias | null; expires: number }>();

function getToken() {
  const token = process.env.MAPBOX_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  return token?.startsWith("pk.") && !token.includes("placeholder") ? token : null;
}

// Mapbox only matches Japanese/Chinese names when those languages are requested;
// the first entry also controls the display language of results.
function languagesFor(q: string) {
  if (/[぀-ヿ]/.test(q)) return "ja,zh,en";
  if (/[㐀-䶿一-鿿]/.test(q)) return "zh,ja,en";
  return "en,ja,zh";
}

async function resolveBias(tripId: string, token: string): Promise<Bias | null> {
  const cached = biasCache.get(tripId);
  if (cached && cached.expires > Date.now()) return cached.bias;

  let bias: Bias | null = null;
  try {
    const supabase = await createClient();
    const { data: trip } = await supabase
      .from("trips")
      .select("destination")
      .eq("id", tripId)
      .single();
    const destination = trip?.destination?.trim();
    if (destination) {
      const res = await fetch(
        `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(destination)}&access_token=${token}&limit=1&types=place,region,country,locality,district&language=en`
      );
      if (res.ok) {
        const data = (await res.json()) as { features?: GeocodeV6Feature[] };
        const f = data.features?.[0];
        const country = f?.properties.context?.country?.country_code?.toLowerCase();
        if (f && country) {
          bias = { country, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] };
        }
      }
    }
  } catch {
    bias = null;
  }
  biasCache.set(tripId, { bias, expires: Date.now() + BIAS_TTL_MS });
  return bias;
}

async function searchMapbox(q: string, token: string, bias: Bias | null): Promise<GeocodeFeature[]> {
  const params = new URLSearchParams({
    q,
    access_token: token,
    limit: "5",
    language: languagesFor(q),
  });
  if (bias) {
    params.set("country", bias.country);
    params.set("proximity", `${bias.lon},${bias.lat}`);
  }
  const res = await fetch(`https://api.mapbox.com/search/searchbox/v1/forward?${params}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { features?: SearchBoxFeature[] };
  return (data.features ?? []).map(({ properties: p }) => ({
    id: p.mapbox_id,
    place_name: p.full_address ?? (p.place_formatted ? `${p.name}, ${p.place_formatted}` : p.name),
    text: p.name,
    geometry: { coordinates: [p.coordinates.longitude, p.coordinates.latitude] },
  }));
}

async function searchNominatim(q: string, bias: Bias | null): Promise<GeocodeFeature[]> {
  const params = new URLSearchParams({
    format: "json",
    q,
    limit: "5",
    "accept-language": languagesFor(q),
  });
  if (bias) params.set("countrycodes", bias.country);
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { "User-Agent": "SyncTrip/1.0 (travel planning PWA)" },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as NominatimResult[];
  return data.map((item) => ({
    id: String(item.place_id),
    place_name: item.display_name,
    text: item.name || item.display_name.split(",")[0],
    geometry: { coordinates: [parseFloat(item.lon), parseFloat(item.lat)] },
  }));
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const tripId = request.nextUrl.searchParams.get("tripId")?.trim() ?? "";
  if (!isGeocodableQuery(q)) return Response.json([]);

  const token = getToken();
  const search = token
    ? (bias: Bias | null) => searchMapbox(q, token, bias)
    : (bias: Bias | null) => searchNominatim(q, bias);

  try {
    const bias = tripId && token ? await resolveBias(tripId, token) : null;
    let results = await search(bias);
    // A vague destination can resolve to the wrong country; don't let it hide everything.
    if (results.length === 0 && bias) results = await search(null);
    return Response.json(results);
  } catch {
    return Response.json([], { status: 502 });
  }
}
