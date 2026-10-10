import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { extractUrl } from "@/lib/extractUrl";
import { formatDateRange, tripStatus } from "@/lib/dates";
import type { Trip } from "@/lib/types";

// PWA share target (see share_target in public/manifest.json). Apps put the
// link in `url`, `text` or even `title`, so check all three.
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

type ShareTrip = Pick<Trip, "id" | "name" | "destination" | "start_date" | "end_date" | "cover_url">;

export default async function SharePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const url =
    extractUrl(first(params.url)) ?? extractUrl(first(params.text)) ?? extractUrl(first(params.title));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("trip_members")
    .select("trips(id, name, destination, start_date, end_date, cover_url)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false });
  const trips = ((data ?? []) as unknown as { trips: ShareTrip | null }[])
    .map((m) => m.trips)
    .filter((t): t is ShareTrip => t !== null)
    // Past trips last; you're rarely saving ideas for a trip that's over.
    .sort(
      (a, b) =>
        Number(tripStatus(a.start_date, a.end_date).kind === "past") -
        Number(tripStatus(b.start_date, b.end_date).kind === "past")
    );

  const target = (tripId: string) => `/trips/${tripId}?share=${encodeURIComponent(url ?? "")}`;
  if (url && trips.length === 1) redirect(target(trips[0].id));

  return (
    <div className="tab-content" style={{ padding: "0 0 var(--tab-height)", minHeight: "100dvh" }}>
      <header
        style={{
          padding: "56px 24px 20px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        <p
          style={{
            fontSize: "11px",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--blue)",
            marginBottom: "4px",
            fontWeight: 600,
          }}
        >
          Save a place
        </p>
        <h1 style={{ fontSize: "26px", fontWeight: 500, color: "var(--text)" }}>Which trip is it for?</h1>
        {url && (
          <p
            style={{
              marginTop: "8px",
              fontSize: "13px",
              color: "var(--text-muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {url}
          </p>
        )}
      </header>

      <div style={{ padding: "24px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {!url ? (
          <div style={{ textAlign: "center", padding: "48px 12px" }}>
            <p style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "24px" }}>
              We couldn&apos;t find a link in what was shared. Open a trip and paste the link into
              &ldquo;Add a place&rdquo; instead.
            </p>
            <Link href="/dashboard" className="btn btn-primary">
              Go to your trips
            </Link>
          </div>
        ) : trips.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 12px" }}>
            <p style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "24px" }}>
              You don&apos;t have any trips yet. Create one first, then share the link again.
            </p>
            <Link href="/trips/new" className="btn btn-primary">
              Plan a trip
            </Link>
          </div>
        ) : (
          trips.map((trip) => (
            <Link
              key={trip.id}
              href={target(trip.id)}
              className="card"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "14px",
                padding: "12px 14px",
                textDecoration: "none",
                color: "var(--text)",
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "var(--radius-sm)",
                  flexShrink: 0,
                  background: trip.cover_url
                    ? `url(${trip.cover_url}) center/cover`
                    : "linear-gradient(135deg, #e7c9a9 0%, #b85c38 100%)",
                }}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "15px", fontWeight: 500 }}>{trip.name}</div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  {[trip.destination, formatDateRange(trip.start_date, trip.end_date)].filter(Boolean).join(" · ")}
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
