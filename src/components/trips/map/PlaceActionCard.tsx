"use client";

import { useState, type CSSProperties } from "react";
import type { ItineraryItem, SavedPlace, VoteValue } from "@/lib/types";
import { optimisticCounts } from "@/lib/votes";
import { CATEGORY_STYLE } from "./mapStyles";

interface Props {
  place: SavedPlace;
  /** The place's itinerary items on valid days, in day order. */
  placeItems: ItineraryItem[];
  /** Position of each item within its day (1-based), by item id. */
  stopNumbers: Map<string, number>;
  totalDays: number;
  currentUserId: string;
  online: boolean;
  /** True while an add/move is being saved. */
  saving: boolean;
  error: string | null;
  onVote: (value: VoteValue | undefined) => void;
  onPickDay: (day: number) => void;
  onComments: () => void;
  onClose: () => void;
}

/** Floating card for the tapped pin: votes, add/move to a day, directions, comments. */
export default function PlaceActionCard({
  place,
  placeItems,
  stopNumbers,
  totalDays,
  currentUserId,
  online,
  saving,
  error,
  onVote,
  onPickDay,
  onComments,
  onClose,
}: Props) {
  const votes = place.votes ?? [];
  const myVote = votes.find((v) => v.user_id === currentUserId)?.value;
  // Parent keys this card by place id, so the optimistic vote resets per place.
  const [optimisticVote, setOptimisticVote] = useState<VoteValue | undefined>(myVote);
  const [pickingDay, setPickingDay] = useState(false);
  const counts = optimisticCounts(votes, currentUserId, optimisticVote);
  const commentCount = place.place_comments?.[0]?.count ?? 0;
  const style = CATEGORY_STYLE[place.category] ?? CATEGORY_STYLE.other;

  const scheduledDays = new Set(placeItems.map((i) => i.day_index));
  // One slot: offer a move. None or several: offer adding it to (another) day.
  const action = placeItems.length === 1 ? "Move to day" : placeItems.length === 0 ? "Add to day" : "Add to another day";

  function vote(value: VoteValue) {
    const next = optimisticVote === value ? undefined : value;
    setOptimisticVote(next);
    onVote(next);
  }

  const hasCoords = place.latitude != null && place.longitude != null;
  const directionsUrl = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}`
    : null;

  const pillButton = (active = false): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "6px 10px",
    borderRadius: "99px",
    border: `1px solid ${active ? "var(--gold)" : "var(--noir-border-strong)"}`,
    background: active ? "var(--gold-dim)" : "transparent",
    color: active ? "var(--gold-dark)" : "var(--noir-text)",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
    textDecoration: "none",
    whiteSpace: "nowrap",
  });

  return (
    <div
      className="animate-fade-up"
      role="dialog"
      aria-label={place.title}
      style={{
        position: "absolute",
        bottom: "calc(var(--tab-height) + 16px)",
        left: "16px",
        right: "16px",
        maxWidth: 440,
        margin: "0 auto",
        background: "rgba(255,253,249,0.97)",
        backdropFilter: "blur(16px)",
        border: "1px solid var(--noir-border-strong)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        boxShadow: "var(--shadow-lg)",
        color: "var(--noir-text)",
        zIndex: 15,
      }}
    >
      <div style={{ display: "flex", alignItems: "stretch" }}>
        {place.photo_url && (
          <div style={{ width: "96px", background: `url(${place.photo_url}) center/cover`, flexShrink: 0 }} />
        )}
        <div style={{ padding: "12px 14px", flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
            <h4
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: "16px",
                fontWeight: 600,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {place.title}
            </h4>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                background: "none",
                border: "none",
                color: "var(--noir-text-muted)",
                fontSize: "18px",
                cursor: "pointer",
                lineHeight: 1,
                padding: 0,
              }}
            >
              ×
            </button>
          </div>
          {place.address && (
            <p
              style={{
                color: "var(--noir-text-muted)",
                fontSize: "12px",
                marginTop: "2px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {place.address}
            </p>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", marginTop: "8px" }}>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 600,
                padding: "3px 8px",
                borderRadius: "99px",
                background: style.color,
                color: "#fff",
              }}
            >
              {style.icon} {style.label}
            </span>
            <span style={{ fontSize: "12px", color: "var(--noir-text-muted)" }}>
              {placeItems.length === 0
                ? "Not in the itinerary yet"
                : placeItems.map((i) => `Day ${i.day_index} · stop ${stopNumbers.get(i.id) ?? "?"}`).join(", ")}
            </span>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "6px",
          padding: "10px 14px 12px",
          borderTop: "1px solid var(--noir-border)",
        }}
      >
        <button
          onClick={() => vote("yaay")}
          disabled={!online}
          aria-pressed={optimisticVote === "yaay"}
          style={pillButton(optimisticVote === "yaay")}
        >
          ✦ Yaay {counts.yaay}
        </button>
        <button
          onClick={() => vote("naay")}
          disabled={!online}
          aria-pressed={optimisticVote === "naay"}
          style={pillButton(optimisticVote === "naay")}
        >
          ✕ Naay {counts.naay}
        </button>
        <button
          onClick={() => setPickingDay((v) => !v)}
          disabled={!online || saving}
          aria-expanded={pickingDay}
          style={pillButton(pickingDay)}
        >
          📅 {saving ? "Saving…" : `${action}…`}
        </button>
        {directionsUrl && (
          <a href={directionsUrl} target="_blank" rel="noopener noreferrer" style={pillButton()}>
            🧭 Directions
          </a>
        )}
        <button onClick={onComments} style={pillButton()}>
          💬 {commentCount > 0 ? commentCount : "Comments"}
        </button>
      </div>

      {pickingDay && (
        <div
          className="map-chip-row"
          style={{ display: "flex", gap: "6px", overflowX: "auto", padding: "0 14px 12px", scrollbarWidth: "none" }}
        >
          {Array.from({ length: totalDays }, (_, i) => i + 1).map((day) => {
            const here = scheduledDays.has(day);
            return (
              <button
                key={day}
                disabled={here || saving}
                onClick={() => {
                  setPickingDay(false);
                  onPickDay(day);
                }}
                style={{ ...pillButton(here), flexShrink: 0, opacity: here ? 0.6 : 1 }}
                title={here ? "Already on this day" : undefined}
              >
                Day {day}
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <p role="alert" style={{ color: "var(--red)", fontSize: "12px", padding: "0 14px 12px" }}>
          {error}
        </p>
      )}
    </div>
  );
}
