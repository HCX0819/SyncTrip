import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createRateLimiter, TtlCache } from "@/lib/rateLimit";
import type { WeatherDay } from "@/lib/weather";

const isRateLimited = createRateLimiter(20, 60 * 1000);
const forecastCache = new TtlCache<WeatherDay[]>(60 * 60 * 1000);

interface OpenMeteoResponse {
  daily?: {
    time: string[];
    weathercode: (number | null)[];
    temperature_2m_max: (number | null)[];
    temperature_2m_min: (number | null)[];
    precipitation_probability_max?: (number | null)[];
  };
}

function getToken() {
  const token = process.env.MAPBOX_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  return token?.startsWith("pk.") && !token.includes("placeholder") ? token : null;
}

async function geocodeDestination(destination: string): Promise<{ lat: number; lon: number } | null> {
  const token = getToken();
  if (token) {
    const res = await fetch(
      `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(destination)}&access_token=${token}&limit=1&types=place,region,country,locality,district&language=en`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { features?: { geometry: { coordinates: [number, number] } }[] };
    const c = data.features?.[0]?.geometry.coordinates;
    return c ? { lon: c[0], lat: c[1] } : null;
  }

  const params = new URLSearchParams({ format: "json", q: destination, limit: "1" });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { "User-Agent": "SyncTrip/1.0 (travel planning PWA)" },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { lat: string; lon: string }[];
  return data[0] ? { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) } : null;
}

export async function GET(request: NextRequest) {
  const tripId = request.nextUrl.searchParams.get("tripId")?.trim() ?? "";
  if (!tripId) return Response.json({ error: "Missing tripId" }, { status: 400 });

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

  const cached = forecastCache.get(tripId);
  if (cached) return Response.json({ days: cached });

  if (isRateLimited(user.id)) return Response.json({ error: "Too many requests" }, { status: 429 });

  try {
    // The saved places say more about where the group will actually be than
    // the destination name does, so prefer their centre.
    const { data: places } = await supabase
      .from("saved_places")
      .select("latitude, longitude")
      .eq("trip_id", tripId)
      .not("latitude", "is", null)
      .not("longitude", "is", null);

    let coords: { lat: number; lon: number } | null = null;
    if (places && places.length > 0) {
      coords = {
        lat: places.reduce((s, p) => s + Number(p.latitude), 0) / places.length,
        lon: places.reduce((s, p) => s + Number(p.longitude), 0) / places.length,
      };
    } else {
      const { data: trip } = await supabase.from("trips").select("destination").eq("id", tripId).single();
      const destination = trip?.destination?.trim();
      if (destination) coords = await geocodeDestination(destination);
    }
    if (!coords) return Response.json({ days: [] });

    const params = new URLSearchParams({
      latitude: coords.lat.toFixed(4),
      longitude: coords.lon.toFixed(4),
      daily: "weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
      timezone: "auto",
      forecast_days: "16",
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!res.ok) return Response.json({ error: "Forecast unavailable" }, { status: 502 });

    const daily = ((await res.json()) as OpenMeteoResponse).daily;
    const days: WeatherDay[] = [];
    daily?.time.forEach((date, i) => {
      const code = daily.weathercode[i];
      const max = daily.temperature_2m_max[i];
      const min = daily.temperature_2m_min[i];
      if (code == null || max == null || min == null) return;
      days.push({ date, code, max, min, rain: daily.precipitation_probability_max?.[i] ?? null });
    });

    forecastCache.set(tripId, days);
    return Response.json({ days });
  } catch {
    return Response.json({ error: "Forecast unavailable" }, { status: 502 });
  }
}
