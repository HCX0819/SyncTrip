"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { PlaceComment } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { useOnlineStatus } from "@/components/layout/OfflineBanner";
import { timeAgo } from "./ActivityFeedSheet";

const MAX_LENGTH = 1000;
const SELECT = "*, author:profiles(id, display_name, avatar_url)";

interface Props {
  placeId: string;
  tripId: string;
  placeTitle: string;
  currentUserId: string;
  onClose: () => void;
  /** Called after a comment is added or deleted, so the count on the card refreshes. */
  onChanged: () => void;
}

export default function PlaceCommentsSheet({
  placeId,
  tripId,
  placeTitle,
  currentUserId,
  onClose,
  onChanged,
}: Props) {
  const [comments, setComments] = useState<PlaceComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const online = useOnlineStatus();
  const [supabase] = useState(() => createClient());

  async function fetchComments() {
    const { data, error } = await supabase
      .from("place_comments")
      .select(SELECT)
      .eq("place_id", placeId)
      .order("created_at", { ascending: true });
    return error ? null : ((data ?? []) as PlaceComment[]);
  }

  useEffect(() => {
    let cancelled = false;
    fetchComments().then((data) => {
      if (cancelled) return;
      setLoading(false);
      if (data) setComments(data);
      else setError("Couldn't load comments.");
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setSending(true);
    setError(null);
    const { data, error } = await supabase
      .from("place_comments")
      .insert({ place_id: placeId, trip_id: tripId, user_id: currentUserId, body: text })
      .select(SELECT)
      .single();
    setSending(false);
    if (error || !data) {
      setError(error?.message ?? "Couldn't post your comment.");
      return;
    }
    setComments((prev) => [...prev, data as PlaceComment]);
    setBody("");
    onChanged();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this comment?")) return;
    const previous = comments;
    setComments((prev) => prev.filter((c) => c.id !== id));
    const { error } = await supabase.from("place_comments").delete().eq("id", id);
    if (error) {
      setComments(previous);
      setError("Couldn't delete the comment.");
      return;
    }
    onChanged();
  }

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
            marginBottom: "4px",
          }}
        >
          Comments
        </h2>
        <p style={{ color: "var(--text-muted)", fontSize: "13px", marginBottom: "16px" }}>{placeTitle}</p>

        {loading && <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>Loading…</p>}

        {!loading && comments.length === 0 && (
          <p style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "12px" }}>
            No comments yet. Start the conversation.
          </p>
        )}

        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            maxHeight: "45vh",
            overflowY: "auto",
          }}
        >
          {comments.map((c) => {
            const mine = c.user_id === currentUserId;
            return (
              <li
                key={c.id}
                style={{
                  padding: "10px 0",
                  borderBottom: "1px solid var(--border)",
                  fontSize: "14px",
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "2px" }}>
                  <strong style={{ fontWeight: 600 }}>
                    {mine ? "You" : c.author?.display_name ?? "Someone"}
                  </strong>
                  <span style={{ color: "var(--text-light)", fontSize: "12px" }}>{timeAgo(c.created_at)}</span>
                  {mine && (
                    <button
                      onClick={() => handleDelete(c.id)}
                      disabled={!online}
                      style={{
                        marginLeft: "auto",
                        background: "none",
                        border: "none",
                        color: "var(--text-muted)",
                        fontSize: "12px",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
                <p style={{ color: "var(--text)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{c.body}</p>
              </li>
            );
          })}
        </ul>

        {error && <p style={{ color: "var(--red)", fontSize: "13px", marginTop: "12px" }}>{error}</p>}

        <form onSubmit={handleSubmit} style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
          <input
            className="input"
            aria-label="Write a comment"
            placeholder={online ? "Write a comment…" : "You're offline"}
            value={body}
            maxLength={MAX_LENGTH}
            onChange={(e) => setBody(e.target.value)}
            disabled={!online}
            style={{ flex: 1 }}
          />
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={sending || !online || !body.trim()}
          >
            {sending ? "Posting…" : "Post"}
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
}
