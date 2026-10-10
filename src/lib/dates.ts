// Trip dates are Postgres `date` columns ("2026-10-08"). `new Date(str)` parses
// those as UTC midnight, which renders as the previous day for anyone west of
// UTC. These helpers keep them as local calendar dates instead.

/** Parses "YYYY-MM-DD" as a local-time date. Returns null for empty/invalid input. */
export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Formats a "YYYY-MM-DD" string with en-US locale options, or null if unparseable. */
export function formatTripDate(
  value: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }
): string | null {
  const date = parseDateOnly(value);
  return date ? date.toLocaleDateString("en-US", opts) : null;
}

/** Date of day N (1-based) of a trip starting on `startDate`, or null. */
export function tripDayDate(startDate: string | null | undefined, dayIndex: number): Date | null {
  const start = parseDateOnly(startDate);
  if (!start) return null;
  // The Date constructor rolls day overflow into the next month/year.
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + dayIndex - 1);
}

/** Inclusive number of calendar days between two "YYYY-MM-DD" strings, or null. */
export function tripDayCount(
  startDate: string | null | undefined,
  endDate: string | null | undefined
): number | null {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!start || !end) return null;
  // Round to absorb the 1-hour DST difference between local midnights.
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

/**
 * Compact range: "Jan 6 – 16, 2027", "Jan 30 – Feb 4, 2027",
 * "Dec 28, 2026 – Jan 3, 2027". Falls back to whichever end is set.
 */
export function formatDateRange(
  startDate: string | null | undefined,
  endDate: string | null | undefined
): string | null {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!start || !end) {
    const only = start ?? end;
    return only ? only.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;
  }

  const month = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
  if (start.getFullYear() !== end.getFullYear()) {
    const full = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return `${full(start)} – ${full(end)}`;
  }
  if (start.getMonth() !== end.getMonth()) {
    return `${month(start)} ${start.getDate()} – ${month(end)} ${end.getDate()}, ${end.getFullYear()}`;
  }
  if (start.getDate() === end.getDate()) {
    return `${month(start)} ${start.getDate()}, ${start.getFullYear()}`;
  }
  return `${month(start)} ${start.getDate()} – ${end.getDate()}, ${end.getFullYear()}`;
}

export type TripStatus =
  | { kind: "upcoming"; daysUntil: number }
  | { kind: "ongoing"; day: number }
  | { kind: "past" }
  | { kind: "undated" };

/** Where a trip sits relative to `today` (local calendar days). */
export function tripStatus(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  today: Date = new Date()
): TripStatus {
  const start = parseDateOnly(startDate);
  if (!start) return { kind: "undated" };
  const end = parseDateOnly(endDate) ?? start;
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const daysUntil = Math.round((start.getTime() - midnight.getTime()) / 86_400_000);
  if (daysUntil > 0) return { kind: "upcoming", daysUntil };
  if (midnight.getTime() <= end.getTime()) return { kind: "ongoing", day: 1 - daysUntil };
  return { kind: "past" };
}
