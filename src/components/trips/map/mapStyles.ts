import type { Category } from "@/lib/types";

export type MapTheme = "light" | "dark";

// OpenFreeMap: free vector styles built for MapLibre, no API key or usage cap.
// https://openfreemap.org
export const MAP_STYLES: Record<MapTheme, string> = {
  light: "https://tiles.openfreemap.org/styles/liberty",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

/** Pin colour, icon and label per category; the filter chips double as the legend. */
export const CATEGORY_STYLE: Record<Category, { color: string; icon: string; label: string }> = {
  stay: { color: "#E91E63", icon: "🏨", label: "Stay" },
  eat: { color: "#FF7043", icon: "🍜", label: "Eat" },
  do: { color: "#1E88E5", icon: "🎯", label: "Do" },
  other: { color: "#00897B", icon: "📍", label: "Other" },
};

export const ROUTE_COLOR = "#b85c38";

const THEME_KEY = "synctrip:map-theme";

export function loadMapTheme(): MapTheme {
  try {
    return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function saveMapTheme(theme: MapTheme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage blocked: the choice just isn't remembered.
  }
}
