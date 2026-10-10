"use client";

import { useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import type { Trip, SavedPlace, Category } from "@/lib/types";
import PlaceCard from "./PlaceCard";
import AddPlaceModal from "./AddPlaceModal";
import { useOnlineStatus } from "@/components/layout/OfflineBanner";

interface Props {
  trip: Trip;
  places: SavedPlace[];
  currentUserId: string;
  memberCount: number;
  onPlaceAdded: () => void;
  onVoteChanged: () => void;
}

const CATEGORIES: { value: Category | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "stay", label: "🏨 Stay" },
  { value: "eat", label: "🍜 Eat" },
  { value: "do", label: "🎯 Do" },
  { value: "other", label: "⋯ Other" },
];

const noopSubscribe = () => () => {};

export default function MoodboardView({
  trip,
  places,
  currentUserId,
  memberCount,
  onPlaceAdded,
  onVoteChanged,
}: Props) {
  const [filter, setFilter] = useState<Category | "all">("all");
  const searchParams = useSearchParams();
  // A link shared into the app via /share arrives as ?share=<url>.
  const [sharedUrl, setSharedUrl] = useState(() => searchParams.get("share"));
  const [showAdd, setShowAdd] = useState(() => !!searchParams.get("share"));
  // AddPlaceModal portals into document.body, so it can't render during SSR.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const online = useOnlineStatus();

  function closeAdd() {
    setShowAdd(false);
    if (sharedUrl) {
      setSharedUrl(null);
      // Drop ?share= so a refresh doesn't reopen the modal.
      const url = new URL(window.location.href);
      url.searchParams.delete("share");
      window.history.replaceState(null, "", url);
    }
  }

  const filtered = filter === "all" ? places : places.filter((p) => p.category === filter);

  return (
    <div
      style={{
        height: "calc(100dvh - 160px)",
        overflowY: "auto",
        paddingBottom: "calc(var(--tab-height) + 80px)",
      }}
    >
      {/* Filter pills */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          padding: "16px 20px",
          overflowX: "auto",
          scrollbarWidth: "none",
        }}
      >
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            id={`filter-${cat.value}`}
            onClick={() => setFilter(cat.value)}
            style={{
              padding: "7px 16px",
              borderRadius: "99px",
              border: "1px solid",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "all 0.18s",
              background: filter === cat.value ? "var(--accent-dim)" : "transparent",
              borderColor: filter === cat.value ? "var(--accent)" : "var(--border)",
              color: filter === cat.value ? "var(--accent)" : "var(--text-muted)",
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "60px 24px",
            color: "var(--text-muted)",
          }}
        >
          <p style={{ fontSize: "32px", marginBottom: "12px", opacity: 0.4 }}>◈</p>
          <p style={{ fontFamily: "var(--font-serif)", fontSize: "18px", color: "var(--text)", marginBottom: "8px" }}>
            Nothing saved yet
          </p>
          <p style={{ fontSize: "14px" }}>
            {filter === "all"
              ? "Add the first place to get started."
              : `No ${filter} spots saved yet.`}
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "16px",
            padding: "0 20px",
          }}
        >
          {filtered.map((place, i) => (
            <div
              key={place.id}
              className="animate-fade-up"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <PlaceCard
                place={place}
                currentUserId={currentUserId}
                memberCount={memberCount}
                onVoteChanged={onVoteChanged}
              />
            </div>
          ))}
        </div>
      )}

      {/* FAB */}
      <button
        id="add-place-fab"
        onClick={() => setShowAdd(true)}
        disabled={!online}
        style={{
          position: "fixed",
          bottom: "calc(var(--tab-height) + 20px + env(safe-area-inset-bottom, 0px))",
          right: "20px",
          width: "52px",
          height: "52px",
          borderRadius: "50%",
          background: "var(--accent)",
          color: "#fffdf9",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "24px",
          border: "none",
          cursor: online ? "pointer" : "not-allowed",
          opacity: online ? 1 : 0.5,
          boxShadow: "0 4px 20px rgba(201,168,76,0.35)",
          transition: "transform 0.2s var(--ease-out)",
          zIndex: 30,
          fontWeight: 300,
        }}
        title={online ? "Add a place" : "You're offline"}
      >
        +
      </button>

      {showAdd && hydrated && (
        <AddPlaceModal
          tripId={trip.id}
          initialUrl={sharedUrl}
          onClose={closeAdd}
          onSaved={() => {
            closeAdd();
            onPlaceAdded();
          }}
        />
      )}
    </div>
  );
}
