import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildTripCalendar, calendarFileName, type CalendarItem } from "@/lib/ics";
import type { Trip } from "@/lib/types";

// encodeURIComponent leaves ' ( ) * unescaped, which RFC 5987 doesn't allow.
const encodeRfc5987 = (value: string) =>
  encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

// GET /api/trips/:tripId/calendar — the trip's itinerary as an .ics download.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const [tripRes, memberRes, itemsRes] = await Promise.all([
    supabase.from("trips").select("*").eq("id", tripId).maybeSingle(),
    supabase
      .from("trip_members")
      .select("id")
      .eq("trip_id", tripId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("itinerary_items")
      .select("*, place:saved_places(*)")
      .eq("trip_id", tripId)
      .order("day_index", { ascending: true })
      .order("sort_order", { ascending: true }),
  ]);

  // RLS hides other trips, but check membership explicitly too. Same 404 for
  // "doesn't exist" and "not a member" so trip ids can't be probed.
  if (tripRes.error || !tripRes.data || memberRes.error || !memberRes.data) {
    return new Response("Not found", { status: 404 });
  }
  if (itemsRes.error) return new Response("Couldn't load the itinerary", { status: 500 });

  const trip = tripRes.data as Trip;
  const body = buildTripCalendar(trip, (itemsRes.data ?? []) as CalendarItem[]);
  const stem = calendarFileName(trip.name);

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${stem}.ics"; filename*=UTF-8''${encodeRfc5987(trip.name || stem)}.ics`,
      "Cache-Control": "private, no-store",
    },
  });
}
