// Calendar export helpers: a hand-rolled RFC 5545 (.ics) writer and Google
// Calendar "add event" links. Pure functions, safe on server and client.
import type { ItineraryItem, SavedPlace, Trip } from "./types";
import { tripDayCount, tripDayDate } from "./dates";

// Optional per-item times (nullable Postgres `time` columns, "HH:MM[:SS]").
export type CalendarItem = ItineraryItem & {
  start_time?: string | null;
  end_time?: string | null;
};

export type EventTiming =
  | { allDay: true; start: string; end: string } // YYYYMMDD, end exclusive
  | { allDay: false; start: string; end: string }; // floating YYYYMMDDTHHMMSS

const pad = (n: number, len = 2) => String(n).padStart(len, "0");

const formatDate = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

const formatDateTime = (d: Date) =>
  `${formatDate(d)}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

/** UTC timestamp for DTSTAMP, e.g. 20261010T083000Z. */
export function formatUtcStamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function parseTime(value: string | null | undefined): [number, number, number] | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const s = Number(m[3] ?? 0);
  if (h > 23 || min > 59 || s > 59) return null;
  return [h, min, s];
}

/**
 * When an item happens: all day on trip start + day_index − 1, or a floating
 * local time range when start_time is set (end defaults to +1h; an end before
 * the start rolls to the next day). Null when the trip has no start date.
 */
export function eventTiming(startDate: string | null | undefined, item: CalendarItem): EventTiming | null {
  const day = tripDayDate(startDate, item.day_index);
  if (!day) return null;

  const start = parseTime(item.start_time);
  if (!start) {
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    return { allDay: true, start: formatDate(day), end: formatDate(next) };
  }

  const startAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), ...start);
  const end = parseTime(item.end_time);
  let endAt = end
    ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), ...end)
    : new Date(startAt.getTime() + 60 * 60 * 1000);
  if (end && endAt <= startAt) {
    endAt = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, ...end);
  }
  return { allDay: false, start: formatDateTime(startAt), end: formatDateTime(endAt) };
}

/** Escapes a TEXT value: backslash, semicolon, comma and newlines. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

const utf8Length = (codePoint: number) =>
  codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;

/**
 * Folds a content line so no physical line exceeds 75 octets (UTF-8). Never
 * splits a multi-byte character; continuation lines start with one space,
 * which counts towards their 75.
 */
export function foldIcsLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const len = utf8Length(ch.codePointAt(0)!);
    if (bytes + len > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
      limit = 74;
    }
    current += ch;
    bytes += len;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

function itemDescription(place: SavedPlace | undefined): string {
  return [place?.note?.trim(), place?.source_url?.trim()].filter(Boolean).join("\n");
}

/**
 * Builds a VCALENDAR for the trip's itinerary. Items are skipped when the trip
 * has no start date or they fall outside the trip's days (the "Unscheduled"
 * list in the UI).
 */
export function buildTripCalendar(trip: Trip, items: CalendarItem[], now: Date = new Date()): string {
  const stamp = formatUtcStamp(now);
  const totalDays = tripDayCount(trip.start_date, trip.end_date);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SyncTrip//Trip Itinerary//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(trip.name)}`,
  ];

  const sorted = [...items].sort(
    (a, b) => a.day_index - b.day_index || a.sort_order - b.sort_order || a.id.localeCompare(b.id)
  );
  for (const item of sorted) {
    const place = item.place;
    if (!place || item.day_index < 1 || (totalDays !== null && item.day_index > totalDays)) continue;
    const timing = eventTiming(trip.start_date, item);
    if (!timing) continue;

    lines.push("BEGIN:VEVENT", `UID:${item.id}@synctrip`, `DTSTAMP:${stamp}`);
    if (timing.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${timing.start}`, `DTEND;VALUE=DATE:${timing.end}`);
    } else {
      lines.push(`DTSTART:${timing.start}`, `DTEND:${timing.end}`);
    }
    lines.push(`SUMMARY:${escapeIcsText(place.title)}`);
    if (place.address) lines.push(`LOCATION:${escapeIcsText(place.address)}`);
    if (place.latitude != null && place.longitude != null) {
      lines.push(`GEO:${place.latitude};${place.longitude}`);
    }
    const description = itemDescription(place);
    if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
    lines.push(`CATEGORIES:${escapeIcsText(place.category.toUpperCase())}`);
    // All-day plans shouldn't mark the whole day as busy.
    lines.push(`TRANSP:${timing.allDay ? "TRANSPARENT" : "OPAQUE"}`, "END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

/** Google Calendar "create event" link for one itinerary item, or null without a trip start date. */
export function googleCalendarUrl(trip: Trip, item: CalendarItem, place: SavedPlace): string | null {
  const timing = eventTiming(trip.start_date, item);
  if (!timing) return null;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: place.title,
    dates: `${timing.start}/${timing.end}`,
  });
  if (place.address) params.set("location", place.address);
  const details = [itemDescription(place), `Trip: ${trip.name}`].filter(Boolean).join("\n\n");
  params.set("details", details);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** ASCII-safe filename stem for Content-Disposition. */
export function calendarFileName(tripName: string): string {
  const ascii = tripName
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return ascii || "trip";
}
