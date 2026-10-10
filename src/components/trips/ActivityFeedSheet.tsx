"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { TripActivity } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

const PAGE_SIZE = 50;
// Consecutive votes or reorders by the same person within this window show as one row.
const GROUP_WINDOW_MS = 10 * 60 * 1000;

interface Props {
  tripId: string;
  currentUserId: string;
  onClose: () => void;
}

interface Row {
  activity: TripActivity;
  count: number;
}

function describe(a: TripActivity, count: number): string {
  const p = a.payload;
  const title = p.title ?? "a place";
  switch (a.kind) {
    case "place_added":
      return `added ${title}`;
    case "place_deleted":
      return `removed ${title}`;
    case "vote":
      return count > 1 ? `voted on ${count} places` : `voted ${p.value === "yaay" ? "👍" : "👎"} on ${title}`;
    case "itinerary_added":
      return `added ${title} to Day ${p.day_index}`;
    case "itinerary_removed":
      return `took ${title} off Day ${p.day_index}`;
    case "itinerary_reordered":
      return count > 1 ? "rearranged the itinerary" : `rearranged Day ${p.day_index}`;
    case "member_joined":
      return "joined the trip";
    case "member_left":
      return "left the trip";
    case "member_removed":
      return `removed ${p.name ?? "a member"} from the trip`;
    default:
      return "made a change";
  }
}

function groupRows(activities: TripActivity[]): Row[] {
  const rows: Row[] = [];
  for (const a of activities) {
    const prev = rows[rows.length - 1];
    if (
      prev &&
      (a.kind === "vote" || a.kind === "itinerary_reordered") &&
      prev.activity.kind === a.kind &&
      prev.activity.actor_id === a.actor_id &&
      new Date(prev.activity.created_at).getTime() - new Date(a.created_at).getTime() < GROUP_WINDOW_MS
    ) {
      prev.count += 1;
      continue;
    }
    rows.push({ activity: a, count: 1 });
  }
  return rows;
}

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ActivityFeedSheet({ tripId, currentUserId, onClose }: Props) {
  const [activities, setActivities] = useState<TripActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  async function fetchPage(offset: number) {
    const { data, error } = await supabase
      .from("trip_activity")
      .select("*")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    return error ? null : ((data ?? []) as TripActivity[]);
  }

  function applyPage(offset: number, page: TripActivity[] | null) {
    setLoading(false);
    if (!page) {
      setError("Couldn't load activity.");
      return;
    }
    setActivities((prev) => (offset === 0 ? page : [...prev, ...page]));
    setHasMore(page.length === PAGE_SIZE);
  }

  async function loadMore() {
    setLoading(true);
    const offset = activities.length;
    applyPage(offset, await fetchPage(offset));
  }

  useEffect(() => {
    let cancelled = false;
    fetchPage(0).then((page) => {
      if (!cancelled) applyPage(0, page);
    });
    supabase.rpc("mark_activity_seen", { p_trip_id: tripId });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  const rows = groupRows(activities);

  // Only rendered after a click (never during SSR), so document is available.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 9999 }}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <h2
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "22px",
            fontWeight: 400,
            marginBottom: "20px",
          }}
        >
          Activity
        </h2>

        {error && <p style={{ color: "var(--red)", fontSize: "13px", marginBottom: "12px" }}>{error}</p>}

        {!loading && rows.length === 0 && !error && (
          <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>
            Nothing yet. Changes your group makes will show up here.
          </p>
        )}

        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column" }}>
          {rows.map(({ activity: a, count }) => {
            const who = a.actor_id === currentUserId ? "You" : a.payload.actor_name ?? "Someone";
            return (
              <li
                key={a.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  padding: "12px 0",
                  borderBottom: "1px solid var(--border)",
                  fontSize: "14px",
                }}
              >
                <span style={{ color: "var(--text)" }}>
                  <strong style={{ fontWeight: 600 }}>{who}</strong> {describe(a, count)}
                </span>
                <span style={{ color: "var(--text-light)", fontSize: "12px", flexShrink: 0 }}>
                  {timeAgo(a.created_at)}
                </span>
              </li>
            );
          })}
        </ul>

        {loading && <p style={{ color: "var(--text-muted)", fontSize: "13px", marginTop: "12px" }}>Loading…</p>}

        {hasMore && !loading && (
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginTop: "16px" }}
            onClick={loadMore}
          >
            Load more
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}
