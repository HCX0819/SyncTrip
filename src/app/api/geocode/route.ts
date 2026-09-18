import type { NextRequest } from "next/server";

export interface GeocodeFeature {
  id: string;
  place_name: string;
  text: string;
  geometry: { coordinates: [number, number] };
}

interface MapboxResponse {
  features?: GeocodeFeature[];
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  name?: string;
  lat: string;
  lon: string;
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) return Response.json([]);

  const token = process.env.MAPBOX_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const hasValidToken = token?.startsWith("pk.") && !token.includes("placeholder");

  try {
    if (hasValidToken) {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${token}&types=place,poi,address&limit=5`
      );
      if (!res.ok) return Response.json([], { status: 502 });
      const data = (await res.json()) as MapboxResponse;
      return Response.json(data.features ?? []);
    }

    // Nominatim requires an identifying User-Agent and refuses bursty browser calls;
    // proxying keeps the request same-origin for the client.
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`,
      { headers: { "User-Agent": "SyncTrip/1.0 (travel planning PWA)" } }
    );
    if (!res.ok) return Response.json([], { status: 502 });
    const data = (await res.json()) as NominatimResult[];
    const features: GeocodeFeature[] = data.map((item) => ({
      id: String(item.place_id),
      place_name: item.display_name,
      text: item.name || item.display_name.split(",")[0],
      geometry: { coordinates: [parseFloat(item.lon), parseFloat(item.lat)] },
    }));
    return Response.json(features);
  } catch {
    return Response.json([], { status: 502 });
  }
}
