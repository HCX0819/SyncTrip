"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Trip, TripMember, SavedPlace } from "@/lib/types";
import MoodboardView from "./MoodboardView";
import MapView from "./MapView";
import ItineraryView from "./ItineraryView";
import ListsView from "./ListsView";
import TripSettingsSheet from "./TripSettingsSheet";
import ActivityFeedSheet from "./ActivityFeedSheet";
import { useOnlineStatus } from "@/components/layout/OfflineBanner";
import { createClient } from "@/lib/supabase/client";
import { formatTripDate } from "@/lib/dates";
import { useTripSync } from "@/lib/useTripSync";
import { formatSavedAt, loadTripSnapshot, saveTripSnapshot } from "@/lib/tripSnapshot";

type Tab = "moodboard" | "map" | "itinerary" | "lists";

interface Props {
  trip: Trip;
  members: TripMember[];
  places: SavedPlace[];
  currentUserId: string;
}

export default function TripTabs({ trip: serverTrip, members: serverMembers, places: initialPlaces, currentUserId }: Props) {
  // Set when offline and a load failed: the last saved copy is shown instead.
  const [snapshot, setSnapshot] = useState<{ trip?: Trip; members?: TripMember[]; savedAt: string } | null>(null);
  const trip = snapshot?.trip ?? serverTrip;
  const members = snapshot?.members ?? serverMembers;
  const [activeTab, setActiveTab] = useState<Tab>("moodboard");
  const [places, setPlaces] = useState(initialPlaces);
  const [showInvite, setShowInvite] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  // Local copy so a reset link shows immediately, before the page refreshes.
  const [inviteToken, setInviteToken] = useState(trip.invite_token);
  const [resettingInvite, setResettingInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const currentUserRole = members.find((m) => m.user_id === currentUserId)?.role ?? "member";
  const inviteUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/join/${inviteToken}`;

  async function resetInviteLink() {
    if (!confirm("Reset the invite link? The current link will stop working.")) return;
    setResettingInvite(true);
    setInviteError(null);
    const { data, error } = await supabase.rpc("rotate_invite_token", { p_trip_id: trip.id });
    setResettingInvite(false);
    if (error || typeof data !== "string") {
      setInviteError(error?.message ?? "Couldn't reset the link.");
      return;
    }
    setInviteToken(data);
  }

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "moodboard", label: "Moodboard", icon: "⊞" },
    { id: "map", label: "Map", icon: "◎" },
    { id: "itinerary", label: "Itinerary", icon: "☰" },
    { id: "lists", label: "Lists", icon: "☑" },
  ];

  async function fetchPlaces() {
    const { data, error } = await supabase
      .from("saved_places")
      .select("*, votes(*), place_comments(count)")
      .eq("trip_id", trip.id)
      .order("created_at", { ascending: false });
    return error || !data ? null : (data as SavedPlace[]);
  }

  // Saves fresh places for offline use; when a load fails offline, falls back
  // to the saved snapshot.
  function applyPlaces(data: SavedPlace[] | null) {
    if (data) {
      setPlaces(data);
      setSnapshot(null);
      saveTripSnapshot(trip.id, { places: data });
      return;
    }
    if (navigator.onLine) return;
    const saved = loadTripSnapshot(trip.id);
    if (!saved) return;
    if (saved.places) setPlaces(saved.places);
    setSnapshot({ trip: saved.trip, members: saved.members, savedAt: saved.updated.places ?? saved.savedAt });
  }

  async function refreshPlaces() {
    applyPlaces(await fetchPlaces());
  }

  // Keep the server-rendered trip and members in the snapshot. Online only, so
  // a page served from the offline cache doesn't overwrite a newer snapshot.
  useEffect(() => {
    if (navigator.onLine) saveTripSnapshot(serverTrip.id, { trip: serverTrip, members: serverMembers });
  }, [serverTrip, serverMembers]);

  useEffect(() => {
    let cancelled = false;
    if (navigator.onLine) {
      saveTripSnapshot(trip.id, { places: initialPlaces });
    } else {
      // Opened offline (page from the service worker cache): try once, then
      // fall back to the snapshot.
      fetchPlaces().then((data) => {
        if (!cancelled) applyPlaces(data);
      });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id]);

  async function fetchUnread() {
    const { data } = await supabase.rpc("get_unread_activity_count", { p_trip_id: trip.id });
    return typeof data === "number" ? data : null;
  }

  async function refreshUnread() {
    const count = await fetchUnread();
    if (count !== null) setUnreadCount(count);
  }

  useEffect(() => {
    let cancelled = false;
    fetchUnread().then((count) => {
      if (!cancelled && count !== null) setUnreadCount(count);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id]);

  // Pick up other members' places, votes, trip edits and membership changes.
  // Paused while a sheet is open so the form underneath isn't replaced.
  const syncTick = useTripSync(
    () => {
      refreshPlaces();
      refreshUnread();
      router.refresh();
    },
    { paused: showInvite || showSettings || showActivity }
  );
  const online = useOnlineStatus();

  const startDate = formatTripDate(trip.start_date, { month: "short", day: "numeric" });
  const endDate = formatTripDate(trip.end_date, { month: "short", day: "numeric", year: "numeric" });

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Trip Header */}
      <header
        style={{
          padding: "52px 20px 0",
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          position: "sticky",
          top: 0,
          zIndex: 20,
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "12px" }}>
          <div style={{ flex: 1 }}>
            <button
              id="back-to-dashboard"
              onClick={() => router.push("/dashboard")}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                fontSize: "13px",
                cursor: "pointer",
                marginBottom: "8px",
                padding: 0,
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              ← Trips
            </button>
            <h1
              style={{
                fontSize: "20px",
                fontWeight: 500,
                lineHeight: 1.2,
                color: "var(--text)",
              }}
            >
              {trip.name}
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "4px" }}>
              <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>📍 {trip.destination}</p>
              {startDate && (
                <p style={{ color: "var(--blue)", fontSize: "12px" }}>
                  {startDate} — {endDate}
                </p>
              )}
            </div>
            {!online && snapshot && (
              <p style={{ color: "var(--text-muted)", fontSize: "11px", marginTop: "4px" }}>
                Offline — saved {formatSavedAt(snapshot.savedAt)}
              </p>
            )}
          </div>

          {/* Invite + settings buttons */}
          <div style={{ display: "flex", gap: "8px", flexShrink: 0, marginLeft: "12px" }}>
            <button
              id="activity-btn"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setShowActivity(true);
                setUnreadCount(0);
              }}
              aria-label={unreadCount > 0 ? `Activity, ${unreadCount} new` : "Activity"}
              title="Activity"
              style={{ position: "relative" }}
            >
              🔔
              {unreadCount > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -4,
                    minWidth: 18,
                    height: 18,
                    padding: "0 5px",
                    borderRadius: 99,
                    background: "var(--red)",
                    color: "#fff",
                    fontSize: "11px",
                    fontWeight: 600,
                    lineHeight: "18px",
                    textAlign: "center",
                  }}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
            <button
              id="invite-btn"
              className="btn btn-ghost btn-sm"
              onClick={() => setShowInvite(true)}
              disabled={!online}
            >
              + Invite
            </button>
            <button
              id="trip-settings-btn"
              className="btn btn-ghost btn-sm"
              onClick={() => setShowSettings(true)}
              aria-label="Trip settings"
              title="Trip settings"
            >
              ⋯
            </button>
          </div>
        </div>

        {/* Member avatars */}
        <div style={{ display: "flex", marginBottom: "12px" }}>
          {members.slice(0, 8).map((m, i) => (
            <div
              key={m.id}
              title={m.profile?.display_name ?? "Member"}
              style={{
                position: "relative",
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "var(--surface-2)",
                border: "2px solid var(--bg)",
                marginLeft: i === 0 ? 0 : -8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "11px",
                fontWeight: 500,
                color: "var(--text-muted)",
                overflow: "hidden",
              }}
            >
              {m.profile?.display_name?.[0]?.toUpperCase() ?? "?"}
              {m.profile?.avatar_url && (
                <img
                  src={m.profile.avatar_url}
                  alt=""
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
            </div>
          ))}
          {members.length > 8 && (
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "var(--surface-2)",
                border: "2px solid var(--bg)",
                marginLeft: -8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "10px",
                color: "var(--text-muted)",
              }}
            >
              +{members.length - 8}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "0" }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                padding: "10px 4px",
                background: "none",
                border: "none",
                borderBottom: activeTab === tab.id ? "2.5px solid var(--blue)" : "2px solid transparent",
                color: activeTab === tab.id ? "var(--blue)" : "var(--text-muted)",
                fontSize: "13px",
                fontWeight: activeTab === tab.id ? 600 : 400,
                cursor: "pointer",
                transition: "color 0.18s, border-color 0.18s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              <span style={{ fontSize: "15px" }}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
        {activeTab === "moodboard" && (
          <MoodboardView
            trip={trip}
            places={places}
            currentUserId={currentUserId}
            memberCount={members.length}
            onPlaceAdded={refreshPlaces}
            onVoteChanged={refreshPlaces}
          />
        )}
        {activeTab === "map" && (
          <MapView places={places} />
        )}
        {activeTab === "itinerary" && (
          <ItineraryView trip={trip} places={places} onUpdate={refreshPlaces} syncTick={syncTick} />
        )}
        {activeTab === "lists" && (
          <ListsView tripId={trip.id} members={members} currentUserId={currentUserId} syncTick={syncTick} />
        )}
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div className="modal-backdrop" onClick={() => setShowInvite(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <h2
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: "22px",
                fontWeight: 400,
                marginBottom: "8px",
              }}
            >
              Invite to {trip.name}
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "24px" }}>
              Share this link with your travel crew. Anyone who opens it will join the trip.
            </p>
            <div
              style={{
                display: "flex",
                gap: "8px",
                alignItems: "center",
                background: "var(--surface-2)",
                borderRadius: "var(--radius-md)",
                padding: "12px 16px",
                border: "1px solid var(--border)",
              }}
            >
              <span
                style={{
                  flex: 1,
                  fontSize: "13px",
                  color: "var(--text-muted)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {inviteUrl}
              </span>
              <button
                id="copy-invite-btn"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  navigator.clipboard.writeText(inviteUrl);
                }}
              >
                Copy
              </button>
            </div>
            {currentUserRole === "owner" && (
              <div style={{ marginTop: "16px" }}>
                <button
                  id="reset-invite-btn"
                  className="btn btn-ghost btn-sm"
                  onClick={resetInviteLink}
                  disabled={resettingInvite}
                >
                  {resettingInvite ? "Resetting…" : "Reset link"}
                </button>
                <p style={{ color: "var(--text-muted)", fontSize: "12px", marginTop: "8px" }}>
                  Resetting makes the old link stop working. Existing members stay in the trip.
                </p>
                {inviteError && (
                  <p style={{ color: "var(--red)", fontSize: "13px", marginTop: "8px" }}>{inviteError}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {showSettings && (
        <TripSettingsSheet
          trip={trip}
          members={members}
          currentUserId={currentUserId}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showActivity && (
        <ActivityFeedSheet
          tripId={trip.id}
          currentUserId={currentUserId}
          onClose={() => setShowActivity(false)}
        />
      )}
    </div>
  );
}
