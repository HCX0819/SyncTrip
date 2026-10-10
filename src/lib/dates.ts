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
