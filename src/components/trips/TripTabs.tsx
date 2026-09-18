"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Trip, TripMember, SavedPlace } from "@/lib/types";
import MoodboardView from "./MoodboardView";
import MapView from "./MapView";
import ItineraryView from "./ItineraryView";
import { createClient } from "@/lib/supabase/client";

type Tab = "moodboard" | "map" | "itinerary";

interface Props {
  trip: Trip;
  members: TripMember[];
  places: SavedPlace[];
  currentUserId: string;
}

export default function TripTabs({ trip, members, places: initialPlaces, currentUserId }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("moodboard");
  const [places, setPlaces] = useState(initialPlaces);
  const [showInvite, setShowInvite] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const inviteUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/join/${trip.id}`;

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "moodboard", label: "Moodboard", icon: "⊞" },
    { id: "map", label: "Map", icon: "◎" },
    { id: "itinerary", label: "Itinerary", icon: "☰" },
  ];

  async function refreshPlaces() {
    const { data } = await supabase
      .from("saved_places")
      .select("*, votes(*)")
      .eq("trip_id", trip.id)
      .order("created_at", { ascending: false });
    if (data) setPlaces(data as SavedPlace[]);
  }

  const startDate = trip.start_date
    ? new Date(trip.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;
  const endDate = trip.end_date
    ? new Date(trip.end_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

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
          boxShadow: "0 1px 3px rgba(60,64,67,0.1)",
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
          </div>

          {/* Invite button */}
          <button
            id="invite-btn"
            className="btn btn-ghost btn-sm"
            onClick={() => setShowInvite(true)}
            style={{ flexShrink: 0, marginLeft: "12px" }}
          >
            + Invite
          </button>
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
          <ItineraryView trip={trip} places={places} onUpdate={refreshPlaces} />
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
          </div>
        </div>
      )}
    </div>
  );
}
