"use client";

import { useEffect, useState } from "react";
import { parseDateOnly } from "./dates";
import { WEATHER_WINDOW_DAYS, type WeatherDay } from "./weather";

// Survives tab switches (the view remounts) so the forecast isn't refetched
// every time; the server caches for an hour as well.
const CACHE_MS = 30 * 60 * 1000;
const clientCache = new Map<string, { days: Map<string, WeatherDay>; at: number }>();

function windowEnd(today: Date) {
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() + WEATHER_WINDOW_DAYS - 1);
}

function todayMidnight() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** True when `date` is within the next WEATHER_WINDOW_DAYS days (today included). */
export function isInWeatherWindow(date: Date | null): boolean {
  if (!date) return false;
  const today = todayMidnight();
  return date >= today && date <= windowEnd(today);
}

function freshCacheHit(tripId: string) {
  const hit = clientCache.get(tripId);
  return hit && Date.now() - hit.at < CACHE_MS ? hit : null;
}

async function fetchForecast(tripId: string): Promise<Map<string, WeatherDay> | null> {
  try {
    const res = await fetch(`/api/weather?tripId=${encodeURIComponent(tripId)}`);
    if (!res.ok) return null;
    const { days } = (await res.json()) as { days?: WeatherDay[] };
    return new Map((days ?? []).map((d) => [d.date, d]));
  } catch {
    return null;
  }
}

/**
 * Daily forecast for the trip, keyed by "YYYY-MM-DD". Makes no request at all
 * unless some day of the trip falls within the forecast window.
 */
export function useWeather(
  tripId: string,
  startDate: string | null | undefined,
  endDate: string | null | undefined
): Map<string, WeatherDay> | null {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate) ?? start;
  const today = todayMidnight();
  const enabled = !!start && !!end && start <= windowEnd(today) && end >= today;

  const [result, setResult] = useState<{ tripId: string; days: Map<string, WeatherDay> } | null>(null);

  useEffect(() => {
    if (!enabled || freshCacheHit(tripId)) return;
    let cancelled = false;
    fetchForecast(tripId).then((days) => {
      if (!days) return;
      clientCache.set(tripId, { days, at: Date.now() });
      if (!cancelled) setResult({ tripId, days });
    });
    return () => {
      cancelled = true;
    };
  }, [tripId, enabled]);

  if (!enabled) return null;
  if (result?.tripId === tripId) return result.days;
  return freshCacheHit(tripId)?.days ?? null;
}
