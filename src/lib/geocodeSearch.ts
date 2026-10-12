// Server-only: reads MAPBOX_TOKEN and uses the server Supabase client.
// Shared by /api/geocode and /api/unfurl.
import { Converter } from "opencc-js/cn2t";
import { createClient } from "@/lib/supabase/server";

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

export interface Bias {
  country: string;
  lon: number;
  lat: number;
}

const BIAS_TTL_MS = 10 * 60 * 1000;
const biasCache = new Map<string, { bias: Bias | null; expires: number }>();

export function getToken() {
  const token = process.env.MAPBOX_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  return token?.startsWith("pk.") && !token.includes("placeholder") ? token : null;
}

// Mapbox only matches Japanese/Chinese names when those languages are requested;
// the first entry also controls the display language of results.
export function languagesFor(q: string) {
  if (/[぀-ヿ]/.test(q)) return "ja,zh,en";
  if (/[㐀-䶿一-鿿]/.test(q)) return "zh,ja,en";
  return "en,ja,zh";
}

// Local place names are stored in local script, so 贵船神社 misses 貴船神社 unless converted.
const LOCAL_HANZI: Record<string, "jp" | "tw" | "hk"> = { jp: "jp", tw: "tw", hk: "hk", mo: "hk" };
const converters = new Map<string, (s: string) => string>();

function localScriptVariant(q: string, bias: Bias | null) {
  if (!/[㐀-䶿一-鿿]/.test(q) || /[぀-ヿ]/.test(q)) return null;
  const target = LOCAL_HANZI[bias?.country ?? "jp"];
  if (!target) return null;
  let convert = converters.get(target);
  if (!convert) {
    convert = Converter({ from: "cn", to: target });
    converters.set(target, convert);
  }
  const variant = convert(q);
  return variant !== q ? variant : null;
}

export async function resolveBias(tripId: string, token: string): Promise<Bias | null> {
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

export async function searchMapbox(q: string, token: string, bias: Bias | null): Promise<GeocodeFeature[]> {
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

export async function searchNominatim(q: string, bias: Bias | null): Promise<GeocodeFeature[]> {
  const params = new URLSearchParams({
    format: "json",
    q,
    limit: "5",
    "accept-language": languagesFor(q),
  });
  if (bias) {
    params.set("countrycodes", bias.country);
    params.set("viewbox", `${bias.lon - 0.5},${bias.lat + 0.5},${bias.lon + 0.5},${bias.lat - 0.5}`);
  }
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

// Nominatim's usage policy allows at most one request per second from the whole app.
// Wait briefly for a slot rather than skip, since results get cached for a day.
let nextNominatimSlot = 0;

async function searchNominatimThrottled(q: string, bias: Bias | null): Promise<GeocodeFeature[]> {
  const wait = nextNominatimSlot - Date.now();
  if (wait > 1500) return [];
  nextNominatimSlot = Math.max(Date.now(), nextNominatimSlot) + 1000;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  return searchNominatim(q, bias);
}

// "Nijō Castle" should match "nijo castle".
const normalize = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f\s'’\-・]/g, "").toLowerCase();

function distanceKm([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]) {
  const dLat = lat2 - lat1;
  const dLon = (lon2 - lon1) * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  return Math.sqrt(dLat * dLat + dLon * dLon) * 111;
}

// Mapbox is thin on landmarks in some countries (Kifune Shrine, teamLab, Sanzen-in), so
// OpenStreetMap results are merged in, and names matching the query near the trip go first.
export async function searchPlaces(q: string, token: string | null, bias: Bias | null) {
  const variant = localScriptVariant(q, bias);
  const queries = variant ? [q, variant] : [q];
  const batches = await Promise.all([
    ...(token ? queries.map((query) => searchMapbox(query, token, bias).catch(() => [])) : []),
    searchNominatimThrottled(q, bias).catch(() => []),
  ]);

  const targets = queries.map(normalize);
  const score = (f: GeocodeFeature) => {
    const name = normalize(f.text);
    let s = 0;
    if (targets.includes(name)) s += 3;
    else if (targets.some((t) => name.includes(t) || (name.length >= 2 && t.includes(name)))) s += 1;
    if (bias && distanceKm(f.geometry.coordinates, [bias.lon, bias.lat]) < 60) s += 2;
    return s;
  };

  const merged: GeocodeFeature[] = [];
  // Interleave sources so each contributes its best results before anyone's tail.
  for (let i = 0; i < 5; i++) {
    for (const batch of batches) {
      const f = batch[i];
      const duplicate = f && merged.some(
        (m) => normalize(m.text) === normalize(f.text) &&
          distanceKm(m.geometry.coordinates, f.geometry.coordinates) < 0.3
      );
      if (f && !duplicate) merged.push(f);
    }
  }
  return merged
    .map((f, i) => ({ f, i, s: score(f) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, 6)
    .map(({ f }) => f);
}
