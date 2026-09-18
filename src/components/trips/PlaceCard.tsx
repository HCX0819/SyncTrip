"use client";

import { useState, useTransition } from "react";
import type { SavedPlace, VoteValue } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import EditPlaceModal from "./EditPlaceModal";

interface Props {
  place: SavedPlace;
  currentUserId: string;
  memberCount: number;
  onVoteChanged: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  stay: "🏨 Stay",
  eat: "🍜 Eat",
  do: "🎯 Do",
  other: "⋯ Other",
};

export default function PlaceCard({ place, currentUserId, memberCount, onVoteChanged }: Props) {
  const votes = place.votes ?? [];
  const myVote = votes.find((v) => v.user_id === currentUserId)?.value as VoteValue | undefined;
  const yaayCount = votes.filter((v) => v.value === "yaay").length;
  const naayCount = votes.filter((v) => v.value === "naay").length;
  const isFavorite = memberCount > 0 && yaayCount > memberCount / 2;
  const [optimisticVote, setOptimisticVote] = useState<VoteValue | undefined>(myVote);
  const [showEdit, setShowEdit] = useState(false);
  const [isPending, startTransition] = useTransition();
  const supabase = createClient();

  async function handleVote(value: VoteValue) {
    const newVote = optimisticVote === value ? undefined : value;
    setOptimisticVote(newVote);

    startTransition(async () => {
      if (newVote === undefined) {
        await supabase
          .from("votes")
          .delete()
          .eq("place_id", place.id)
          .eq("user_id", currentUserId);
      } else {
        await supabase.from("votes").upsert(
          { place_id: place.id, user_id: currentUserId, value: newVote },
          { onConflict: "place_id,user_id" }
        );
      }
      onVoteChanged();
    });
  }

  // Displayed vote counts (optimistic)
  const displayYaay =
    yaayCount +
    (optimisticVote === "yaay" && myVote !== "yaay" ? 1 : 0) -
    (myVote === "yaay" && optimisticVote !== "yaay" ? 1 : 0);
  const displayNaay =
    naayCount +
    (optimisticVote === "naay" && myVote !== "naay" ? 1 : 0) -
    (myVote === "naay" && optimisticVote !== "naay" ? 1 : 0);

  return (
    <>
      <article
        className="card"
        style={{ overflow: "hidden", position: "relative" }}
      >
        {/* Favorite crown */}
        {isFavorite && (
          <div
            style={{
              position: "absolute",
              top: "12px",
              left: "12px",
              zIndex: 5,
              background: "rgba(212,175,55,0.92)",
              color: "#17140f",
              borderRadius: "99px",
              padding: "3px 10px",
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.03em",
              backdropFilter: "blur(4px)",
            }}
          >
            ★ Top Pick
          </div>
        )}

        {/* Edit button overlay on photo */}
        <button
          onClick={() => setShowEdit(true)}
          title="Edit place"
          style={{
            position: "absolute",
            top: "10px",
            right: "10px",
            width: "30px",
            height: "30px",
            borderRadius: "50%",
            background: "rgba(23,20,15,0.8)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(245,241,234,0.18)",
            color: "var(--noir-text)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            fontSize: "13px",
            zIndex: 6,
            boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
            transition: "all 0.15s",
          }}
        >
          ✎
        </button>

        {/* Photo */}
        <div
          style={{
            height: 180,
            background: place.photo_url
              ? `url(${place.photo_url}) center/cover`
              : "linear-gradient(135deg, #2a2418 0%, #17140f 100%)",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(to bottom, transparent 55%, rgba(32,33,36,0.6) 100%)",
            }}
          />
          {!place.photo_url && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "36px",
                opacity: 0.3,
              }}
            >
              {place.category === "stay" ? "🏨" : place.category === "eat" ? "🍜" : place.category === "do" ? "🎯" : "📍"}
            </div>
          )}
        </div>

        {/* Content */}
        <div style={{ padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px", marginBottom: "8px" }}>
            <h3
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: "17px",
                fontWeight: 400,
                lineHeight: 1.3,
                flex: 1,
              }}
            >
              {place.title}
            </h3>
            <span
              className={`badge-${place.category}`}
              style={{
                flexShrink: 0,
                fontSize: "11px",
                fontWeight: 500,
                padding: "3px 10px",
                borderRadius: "99px",
              }}
            >
              {CATEGORY_LABELS[place.category]}
            </span>
          </div>

          {place.address && (
            <p style={{ color: "var(--text-muted)", fontSize: "12px", marginBottom: "8px" }}>
              📍 {place.address}
            </p>
          )}

          {place.note && (
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: "13px",
                marginBottom: "12px",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {place.note}
            </p>
          )}

          {place.source_url && (
            <a
              href={place.source_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-block",
                fontSize: "12px",
                color: "var(--text-muted)",
                marginBottom: "12px",
                textDecoration: "underline",
                textUnderlineOffset: "3px",
              }}
            >
              View source ↗
            </a>
          )}

          {/* Voting + Edit Button */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
            <button
              id={`vote-yaay-${place.id}`}
              className={`vote-btn yaay ${optimisticVote === "yaay" ? "active" : ""}`}
              onClick={() => handleVote("yaay")}
              disabled={isPending}
            >
              ✦ Yaay <span style={{ fontWeight: 600 }}>{displayYaay}</span>
            </button>
            <button
              id={`vote-naay-${place.id}`}
              className={`vote-btn naay ${optimisticVote === "naay" ? "active" : ""}`}
              onClick={() => handleVote("naay")}
              disabled={isPending}
            >
              ✕ Naay <span style={{ fontWeight: 600 }}>{displayNaay}</span>
            </button>
            <button
              onClick={() => setShowEdit(true)}
              style={{
                marginLeft: "auto",
                background: "transparent",
                border: "1px solid var(--border-strong)",
                color: "var(--text-muted)",
                borderRadius: "99px",
                padding: "6px 12px",
                fontSize: "12px",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--blue)";
                e.currentTarget.style.borderColor = "var(--blue)";
                e.currentTarget.style.background = "var(--blue-light)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--text-muted)";
                e.currentTarget.style.borderColor = "var(--border-strong)";
                e.currentTarget.style.background = "transparent";
              }}
            >
              ✎ Edit
            </button>
          </div>
        </div>
      </article>

      {/* Edit Modal */}
      {showEdit && (
        <EditPlaceModal
          place={place}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            onVoteChanged();
          }}
        />
      )}
    </>
  );
}
