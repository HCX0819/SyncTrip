import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import type { Trip } from "@/lib/types";

interface UserTripMembership {
  trip_id: string;
  role: string;
  trips: Trip | null;
}

async function getTrips(userId: string): Promise<UserTripMembership[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("trip_members")
    .select("trip_id, role, trips(*)")
    .eq("user_id", userId)
    .order("joined_at", { ascending: false });
  return (data as unknown as UserTripMembership[]) ?? [];
}

function TripCard({ trip, role }: { trip: Trip; role: string }) {
  const startDate = trip.start_date
    ? new Date(trip.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;
  const endDate = trip.end_date
    ? new Date(trip.end_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <Link
      href={`/trips/${trip.id}`}
      style={{ textDecoration: "none" }}
    >
      <article
        className="card"
        style={{
          overflow: "hidden",
          cursor: "pointer",
          position: "relative",
        }}
      >
        {/* Cover photo or gradient placeholder */}
        <div
          style={{
            height: 160,
            background: trip.cover_url
              ? `url(${trip.cover_url}) center/cover`
              : "linear-gradient(135deg, #e8f0fe 0%, #c5d9f8 100%)",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(to bottom, transparent 40%, rgba(32,33,36,0.55) 100%)",
            }}
          />
          {role === "owner" && (
            <span
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                background: "rgba(26,115,232,0.9)",
                color: "#ffffff",
                borderRadius: "99px",
                padding: "3px 10px",
                fontSize: "11px",
                letterSpacing: "0.03em",
                fontWeight: 600,
                backdropFilter: "blur(4px)",
              }}
            >
              Owner
            </span>
          )}
        </div>
        <div style={{ padding: "16px" }}>
          <h3
            style={{
              fontSize: "17px",
              fontWeight: 500,
              marginBottom: "4px",
              color: "var(--text)",
            }}
          >
            {trip.name}
          </h3>
          <p style={{ color: "var(--text-muted)", fontSize: "13px", marginBottom: "10px" }}>
            📍 {trip.destination}
          </p>
          {startDate && endDate && (
            <p
              style={{
                color: "var(--blue)",
                fontSize: "12px",
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              🗓 {startDate} — {endDate}
            </p>
          )}
        </div>
      </article>
    </Link>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const memberships = await getTrips(user.id);

  return (
    <div
      className="tab-content"
      style={{ padding: "0 0 var(--tab-height)", minHeight: "100dvh" }}
    >
      {/* Header */}
      <header
        style={{
          padding: "56px 24px 20px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          position: "sticky",
          top: 0,
          zIndex: 10,
          boxShadow: "0 1px 3px rgba(60,64,67,0.08)",
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
          SyncTrip
        </p>
        <h1
          style={{
            fontSize: "26px",
            fontWeight: 500,
            color: "var(--text)",
          }}
        >
          Your Trips
        </h1>
      </header>

      {/* Content */}
      <div style={{ padding: "24px 20px" }}>
        {memberships.length === 0 ? (
          <div
            className="animate-fade-up"
            style={{
              textAlign: "center",
              padding: "64px 24px",
            }}
          >
            <div
              style={{
                fontSize: "48px",
                marginBottom: "20px",
                opacity: 0.4,
              }}
            >
              ✈
            </div>
            <h2
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: "22px",
                fontWeight: 400,
                marginBottom: "10px",
              }}
            >
              No trips yet
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "32px" }}>
              Create your first trip and invite your crew.
            </p>
            <Link href="/trips/new" className="btn btn-primary">
              Plan a trip
            </Link>
          </div>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: "16px",
              }}
            >
              {memberships
                .filter((m) => m.trips)
                .map((m) => (
                  <div key={m.trip_id} className="animate-fade-up">
                    <TripCard trip={m.trips!} role={m.role} />
                  </div>
                ))}
            </div>
          </>
        )}
      </div>

      {/* FAB — Google Maps style blue pill */}
      <Link
        id="create-trip-fab"
        href="/trips/new"
        className="fab-btn"
        title="Create new trip"
      >
        + New Trip
      </Link>
    </div>
  );
}
