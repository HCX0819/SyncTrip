import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { MapPin } from "lucide-react";
import type { Trip } from "@/lib/types";
import { formatDateRange, tripDayCount, tripStatus, type TripStatus } from "@/lib/dates";
import TripCountdown from "@/components/trips/TripCountdown";

interface CardMember {
  user_id: string;
  profile: { display_name: string | null; avatar_url: string | null } | null;
}

interface CardTrip extends Trip {
  saved_places: { count: number }[];
  trip_members: CardMember[];
}

interface UserTripMembership {
  trip_id: string;
  role: string;
  trips: CardTrip | null;
}

async function getTrips(userId: string): Promise<UserTripMembership[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("trip_members")
    .select(
      "trip_id, role, trips(*, saved_places(count), trip_members(user_id, profile:profiles(display_name, avatar_url)))"
    )
    .eq("user_id", userId)
    .order("joined_at", { ascending: false });
  return (data as unknown as UserTripMembership[]) ?? [];
}

// Happening now first, then upcoming (soonest first), undated, and past trips
// (most recent first) at the bottom.
const STATUS_RANK: Record<TripStatus["kind"], number> = { ongoing: 0, upcoming: 1, undated: 2, past: 3 };

function sortTrips(memberships: UserTripMembership[]) {
  return memberships
    .filter((m): m is UserTripMembership & { trips: CardTrip } => m.trips !== null)
    .map((m) => ({ ...m, status: tripStatus(m.trips.start_date, m.trips.end_date) }))
    .sort((a, b) => {
      const rank = STATUS_RANK[a.status.kind] - STATUS_RANK[b.status.kind];
      if (rank !== 0) return rank;
      const byStart = (a.trips.start_date ?? "").localeCompare(b.trips.start_date ?? "");
      return a.status.kind === "past" ? -byStart : byStart;
    });
}

// Users sometimes type "-" when they don't know the destination yet.
function hasDestination(destination: string | null | undefined) {
  const d = destination?.trim();
  return !!d && !/^[-–—.]+$/.test(d);
}

function MemberAvatars({ members }: { members: CardMember[] }) {
  const shown = members.slice(0, 3);
  return (
    <div style={{ display: "flex" }}>
      {shown.map((m, i) => (
        <div
          key={m.user_id}
          title={m.profile?.display_name ?? "Member"}
          style={{
            position: "relative",
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: "var(--surface-2)",
            border: "2px solid var(--surface)",
            marginLeft: i === 0 ? 0 : -8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "10px",
            fontWeight: 600,
            color: "var(--text-muted)",
            overflow: "hidden",
            backgroundImage: m.profile?.avatar_url ? `url(${m.profile.avatar_url})` : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          {!m.profile?.avatar_url && (m.profile?.display_name?.[0]?.toUpperCase() ?? "?")}
        </div>
      ))}
    </div>
  );
}

function TripCard({ trip, role, status }: { trip: CardTrip; role: string; status: TripStatus }) {
  const dateRange = formatDateRange(trip.start_date, trip.end_date);
  const days = tripDayCount(trip.start_date, trip.end_date);
  const placeCount = trip.saved_places?.[0]?.count ?? 0;
  const members = trip.trip_members ?? [];
  const isPast = status.kind === "past";

  return (
    <Link href={`/trips/${trip.id}`} style={{ textDecoration: "none" }}>
      <article
        className="card trip-card"
        style={{
          overflow: "hidden",
          cursor: "pointer",
          position: "relative",
        }}
      >
        {/* Cover photo or gradient placeholder, with the title on the scrim */}
        <div
          style={{
            height: 172,
            background: trip.cover_url
              ? `url(${trip.cover_url}) center/cover`
              : "linear-gradient(135deg, #e7c9a9 0%, #b85c38 100%)",
            position: "relative",
            filter: isPast ? "grayscale(0.7)" : undefined,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(to bottom, rgba(20,16,12,0) 35%, rgba(20,16,12,0.72) 100%)",
            }}
          />
          {role === "owner" && (
            <span
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                background: "rgba(20,16,12,0.45)",
                color: "#fffdf9",
                borderRadius: "99px",
                padding: "2px 9px",
                fontSize: "10px",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                fontWeight: 600,
                backdropFilter: "blur(6px)",
              }}
            >
              Owner
            </span>
          )}
          <div style={{ position: "absolute", left: 16, right: 16, bottom: 14 }}>
            <h3
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: "23px",
                fontWeight: 500,
                lineHeight: 1.15,
                color: "#fffdf9",
                textShadow: "0 1px 8px rgba(0,0,0,0.25)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {trip.name}
            </h3>
            {dateRange && (
              <p style={{ color: "rgba(255,253,249,0.88)", fontSize: "12.5px", marginTop: "4px" }}>
                {dateRange}
                {days && days > 1 ? ` · ${days} days` : ""}
              </p>
            )}
          </div>
        </div>

        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>
          {hasDestination(trip.destination) && (
            <p
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                color: "var(--text-muted)",
                fontSize: "13px",
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              <MapPin size={14} strokeWidth={1.75} style={{ flexShrink: 0 }} />
              {trip.destination}
            </p>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
              <MemberAvatars members={members} />
              <span style={{ color: "var(--text-muted)", fontSize: "12px", whiteSpace: "nowrap" }}>
                {members.length} going · {placeCount} {placeCount === 1 ? "place" : "places"}
              </span>
            </div>
            <TripCountdown startDate={trip.start_date} endDate={trip.end_date} />
          </div>
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
          boxShadow: "var(--shadow-sm)",
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
              {sortTrips(memberships).map((m) => (
                <div key={m.trip_id} className="animate-fade-up">
                  <TripCard trip={m.trips} role={m.role} status={m.status} />
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
