import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDateRange, tripDayCount, tripDayDate } from "@/lib/dates";
import type { CalendarItem } from "@/lib/ics";
import type { SavedPlace, Trip } from "@/lib/types";
import PrintButton from "./PrintButton";

export const metadata: Metadata = {
  title: "Print itinerary — SyncTrip",
};

// Hides app chrome and keeps each item on one page when printing.
const printCss = `
@media print {
  #bottom-tab-bar, #offline-banner, .no-print { display: none !important; }
  html, body, .noir-canvas, .print-page { background: #fff !important; color: #000 !important; }
  .print-page { padding: 0 !important; max-width: none !important; }
  .print-item { break-inside: avoid; page-break-inside: avoid; }
  .print-day h2 { break-after: avoid; page-break-after: avoid; }
  .print-muted { color: #444 !important; }
  a { color: inherit !important; text-decoration: none !important; }
}
`;

async function getPrintData(tripId: string, userId: string) {
  const supabase = await createClient();

  const [tripRes, memberRes, itemsRes] = await Promise.all([
    supabase.from("trips").select("*").eq("id", tripId).single(),
    supabase.from("trip_members").select("id").eq("trip_id", tripId).eq("user_id", userId).maybeSingle(),
    supabase
      .from("itinerary_items")
      .select("*, place:saved_places(*)")
      .eq("trip_id", tripId)
      .order("day_index", { ascending: true })
      .order("sort_order", { ascending: true }),
  ]);

  if (tripRes.error || !tripRes.data) return null;
  // Check membership
  if (!memberRes.data) return null;

  return {
    trip: tripRes.data as Trip,
    items: ((itemsRes.data ?? []) as CalendarItem[]).filter((i) => i.place),
  };
}

// "14:30:00" → "2:30 PM"
function formatTime(value: string | null | undefined): string | null {
  const m = value ? /^(\d{1,2}):(\d{2})/.exec(value) : null;
  if (!m) return null;
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

function timeRange(item: CalendarItem): string | null {
  const start = formatTime(item.start_time);
  const end = formatTime(item.end_time);
  if (start && end) return `${start} – ${end}`;
  return start ?? (end ? `until ${end}` : null);
}

export default async function PrintTripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const data = await getPrintData(tripId, user.id);
  if (!data) notFound();

  const { trip, items } = data;
  // Same day range as ItineraryView: 3 days when dates are missing, capped at 30.
  const totalDays = Math.max(1, Math.min(tripDayCount(trip.start_date, trip.end_date) ?? 3, 30));
  const days = Array.from({ length: totalDays }, (_, i) => i + 1);
  const unscheduled = items.filter((i) => i.day_index < 1 || i.day_index > totalDays);
  const dateRange = formatDateRange(trip.start_date, trip.end_date);

  const dayHeading = (day: number) => {
    const date = tripDayDate(trip.start_date, day);
    return date
      ? `Day ${day} · ${date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`
      : `Day ${day}`;
  };

  return (
    <div
      className="print-page"
      style={{
        maxWidth: "720px",
        margin: "0 auto",
        padding: "48px 24px calc(var(--tab-height) + 32px)",
        color: "var(--text)",
      }}
    >
      <style>{printCss}</style>

      <div
        className="no-print"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}
      >
        <Link href={`/trips/${trip.id}`} style={{ color: "var(--text-muted)", fontSize: "13px" }}>
          ← Back to trip
        </Link>
        <PrintButton />
      </div>

      <header style={{ borderBottom: "1px solid var(--border)", paddingBottom: "16px", marginBottom: "24px" }}>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "28px", fontWeight: 400, lineHeight: 1.2 }}>
          {trip.name}
        </h1>
        <p className="print-muted" style={{ color: "var(--text-muted)", fontSize: "14px", marginTop: "4px" }}>
          {trip.destination}
          {dateRange && ` · ${dateRange}`}
        </p>
      </header>

      {days.map((day) => {
        const dayItems = items.filter((i) => i.day_index === day);
        return (
          <section key={day} className="print-day" style={{ marginBottom: "28px" }}>
            <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "20px", fontWeight: 400, marginBottom: "10px" }}>
              {dayHeading(day)}
            </h2>
            {dayItems.length === 0 ? (
              <p className="print-muted" style={{ color: "var(--text-muted)", fontSize: "13px" }}>
                Nothing planned.
              </p>
            ) : (
              <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
                {dayItems.map((item, index) => (
                  <PrintItem key={item.id} item={item} place={item.place!} number={index + 1} />
                ))}
              </ol>
            )}
          </section>
        );
      })}

      {unscheduled.length > 0 && (
        <section className="print-day" style={{ marginBottom: "28px" }}>
          <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "20px", fontWeight: 400, marginBottom: "10px" }}>
            Unscheduled
          </h2>
          <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
            {unscheduled.map((item, index) => (
              <PrintItem key={item.id} item={item} place={item.place!} number={index + 1} />
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function PrintItem({ item, place, number }: { item: CalendarItem; place: SavedPlace; number: number }) {
  const time = timeRange(item);
  return (
    <li
      className="print-item"
      style={{
        display: "flex",
        gap: "12px",
        padding: "10px 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <span style={{ fontWeight: 600, minWidth: "20px", color: "var(--accent)" }}>{number}.</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: "15px", fontWeight: 500 }}>
          {place.title}{" "}
          <span className="print-muted" style={{ color: "var(--text-muted)", fontSize: "12px", fontWeight: 400 }}>
            · {place.category}
            {time && ` · ${time}`}
          </span>
        </p>
        {place.address && (
          <p className="print-muted" style={{ color: "var(--text-muted)", fontSize: "13px", marginTop: "2px" }}>
            {place.address}
          </p>
        )}
        {place.note && (
          <p style={{ fontSize: "13px", marginTop: "4px", whiteSpace: "pre-wrap" }}>{place.note}</p>
        )}
      </div>
    </li>
  );
}
