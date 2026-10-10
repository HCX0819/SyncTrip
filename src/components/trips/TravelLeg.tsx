"use client";

import type { TravelMode } from "@/lib/types";
import { TRAVEL_MODE_ICON, formatDuration, formatLeg, type DayLoad, type Leg } from "@/lib/travel";

/** Connector between two itinerary cards: "🚶 12 min · 0.9 km", or "—" without coordinates. */
export function TravelLeg({
  leg,
  mode,
  exact,
  hidden,
}: {
  leg: Leg | null;
  mode: TravelMode;
  exact: boolean;
  /** Hidden (but still taking up space) while a card is being dragged. */
  hidden?: boolean;
}) {
  return (
    <div
      aria-hidden={hidden}
      title={leg ? (exact ? "Route time" : "Estimated from straight-line distance") : "No location for one of these stops"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        margin: "-4px 0 -4px 22px",
        color: "var(--text-muted)",
        fontSize: "12px",
        opacity: hidden ? 0 : 1,
        transition: "opacity 0.15s",
      }}
    >
      <span style={{ width: "2px", height: "18px", background: "var(--border)", borderRadius: "1px" }} />
      <span>{leg ? `${exact ? "" : "~"}${formatLeg(leg, mode)}` : "—"}</span>
    </div>
  );
}

/** 🚶/🚗 segmented toggle. */
export function TravelModeToggle({
  mode,
  onChange,
}: {
  mode: TravelMode;
  onChange: (mode: TravelMode) => void;
}) {
  const options: { value: TravelMode; label: string }[] = [
    { value: "walk", label: "Walking" },
    { value: "drive", label: "Driving" },
  ];
  return (
    <div
      role="group"
      aria-label="Travel mode"
      style={{
        display: "inline-flex",
        border: "1px solid var(--border)",
        borderRadius: "99px",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {options.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          aria-label={label}
          title={label}
          onClick={() => onChange(value)}
          style={{
            padding: "4px 10px",
            border: "none",
            background: mode === value ? "var(--accent-dim)" : "transparent",
            fontSize: "14px",
            cursor: "pointer",
            opacity: mode === value ? 1 : 0.55,
          }}
        >
          {TRAVEL_MODE_ICON[value]}
        </button>
      ))}
    </div>
  );
}

function formatLoad(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

/** "~7h 30m planned · 45 min travel" plus warnings for overpacked days and overlapping times. */
export function DayLoadSummary({ load }: { load: DayLoad }) {
  const warnings = [
    load.overloaded ? `Packed day (${formatLoad(load.totalMinutes)})` : null,
    load.overlapping.size > 0 ? "Times overlap" : null,
  ].filter((w): w is string => w !== null);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", marginTop: "4px" }}>
      <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>
        ~{formatLoad(load.totalMinutes)} planned
        {load.travelMinutes >= 1 ? ` · ${formatDuration(load.travelMinutes * 60)} travel` : ""}
      </span>
      {warnings.map((w) => (
        <span
          key={w}
          role="status"
          style={{
            fontSize: "11px",
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: "99px",
            border: "1px solid var(--red)",
            background: "var(--red-light)",
            color: "var(--red)",
          }}
        >
          ⚠ {w}
        </span>
      ))}
    </div>
  );
}
