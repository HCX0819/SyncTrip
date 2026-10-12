"use client";

import { tripDayDate } from "@/lib/dates";

export type DayFilter = "all" | number;

/** Scrollable "All · Day 1 · Day 2 …" chips over the map. */
export default function DayStrip({
  startDate,
  totalDays,
  value,
  onChange,
}: {
  startDate: string | null | undefined;
  totalDays: number;
  value: DayFilter;
  onChange: (value: DayFilter) => void;
}) {
  const options: { value: DayFilter; label: string; sub?: string }[] = [
    { value: "all", label: "All" },
    ...Array.from({ length: totalDays }, (_, i) => {
      const date = tripDayDate(startDate, i + 1);
      return {
        value: i + 1,
        label: `Day ${i + 1}`,
        sub: date?.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      };
    }),
  ];

  return (
    <div
      role="tablist"
      aria-label="Show day"
      className="map-chip-row"
      style={{ display: "flex", gap: "6px", overflowX: "auto", padding: "2px", scrollbarWidth: "none" }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            style={{
              flexShrink: 0,
              padding: "6px 12px",
              borderRadius: "99px",
              border: `1px solid ${active ? "var(--gold)" : "var(--noir-border-strong)"}`,
              background: active ? "var(--gold)" : "rgba(255,253,249,0.94)",
              color: active ? "#fffdf9" : "var(--noir-text)",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "var(--shadow-sm)",
              whiteSpace: "nowrap",
            }}
          >
            {opt.label}
            {opt.sub && (
              <span style={{ fontWeight: 400, opacity: 0.8, marginLeft: "4px" }}>{opt.sub}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
