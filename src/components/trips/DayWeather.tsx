"use client";

import { weatherEmoji, weatherLabel, type WeatherDay } from "@/lib/weather";

/** Compact forecast for a day header: "🌤️ 24° / 17°". */
export default function DayWeather({ day }: { day: WeatherDay }) {
  const label = `${weatherLabel(day.code)}, high ${Math.round(day.max)}°, low ${Math.round(day.min)}°${
    day.rain !== null ? `, ${day.rain}% chance of rain` : ""
  }`;
  return (
    <span
      title={label}
      aria-label={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "13px",
        color: "var(--text-muted)",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontSize: "16px" }}>{weatherEmoji(day.code)}</span>
      <span style={{ color: "var(--text)", fontWeight: 500 }}>{Math.round(day.max)}°</span>
      <span>/ {Math.round(day.min)}°</span>
      {day.rain !== null && day.rain >= 30 && <span>· 💧{day.rain}%</span>}
    </span>
  );
}
