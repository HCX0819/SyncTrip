"use client";

import { tripStatus } from "@/lib/dates";

// Rendered on the client so "today" is the viewer's date, not the server's
// (UTC on Vercel). The server render may differ by a day around midnight,
// hence suppressHydrationWarning.
export default function TripCountdown({
  startDate,
  endDate,
}: {
  startDate: string | null;
  endDate: string | null;
}) {
  const status = tripStatus(startDate, endDate);
  if (status.kind === "undated") return null;

  const label =
    status.kind === "upcoming"
      ? status.daysUntil === 1
        ? "Tomorrow"
        : `In ${status.daysUntil} days`
      : status.kind === "ongoing"
        ? `Happening now · Day ${status.day}`
        : "Past trip";

  const live = status.kind === "ongoing";

  return (
    <span
      suppressHydrationWarning
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "3px 10px",
        borderRadius: "99px",
        fontSize: "11px",
        fontWeight: 600,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
        background: status.kind === "past" ? "var(--surface-2)" : "var(--accent-dim)",
        color: status.kind === "past" ? "var(--text-muted)" : "var(--accent)",
      }}
    >
      {live && (
        <span
          aria-hidden
          style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)" }}
        />
      )}
      {label}
    </span>
  );
}
