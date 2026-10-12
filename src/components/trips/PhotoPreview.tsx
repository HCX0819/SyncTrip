"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { PhotoCandidate } from "@/app/api/place-photo/route";

interface Props {
  candidates: PhotoCandidate[];
  index: number;
  selectedUrl: string;
  onIndexChange: (index: number) => void;
  onUse: (url: string) => void;
  onClose: () => void;
}

const SWIPE_PX = 40;

// Full-screen look at a suggested photo before choosing it. Rendered above the
// place modal; arrows, swipe and the keyboard step through the suggestions.
export default function PhotoPreview({ candidates, index, selectedUrl, onIndexChange, onUse, onClose }: Props) {
  const photo = candidates[index];
  const count = candidates.length;
  const touchStartX = useRef<number | null>(null);

  const step = (delta: number) => onIndexChange((index + delta + count) % count);

  // Latest handlers for the keydown listener, which is attached once.
  const keys = useRef({ step, onClose });
  useEffect(() => {
    keys.current = { step, onClose };
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        keys.current.onClose();
      } else if (e.key === "ArrowLeft") keys.current.step(-1);
      else if (e.key === "ArrowRight") keys.current.step(1);
    }
    // Capture phase, so Escape closes the preview before anything underneath sees it.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  if (!photo) return null;
  const isSelected = photo.url === selectedUrl;

  const arrowStyle: React.CSSProperties = {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    width: 40,
    height: 40,
    borderRadius: "50%",
    border: "none",
    background: "rgba(0,0,0,0.45)",
    color: "#fff",
    fontSize: "22px",
    lineHeight: 1,
    cursor: "pointer",
    backdropFilter: "blur(6px)",
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo preview"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(20,16,12,0.92)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        gap: "14px",
      }}
    >
      <button
        type="button"
        aria-label="Close preview"
        onClick={onClose}
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          width: 36,
          height: 36,
          borderRadius: "50%",
          border: "none",
          background: "rgba(255,255,255,0.18)",
          color: "#fff",
          fontSize: "18px",
          cursor: "pointer",
        }}
      >
        ✕
      </button>

      <div
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => (touchStartX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          const start = touchStartX.current;
          touchStartX.current = null;
          if (start === null || count < 2) return;
          const dx = e.changedTouches[0].clientX - start;
          if (Math.abs(dx) > SWIPE_PX) step(dx < 0 ? 1 : -1);
        }}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 900,
          display: "flex",
          justifyContent: "center",
        }}
      >
        {/* Arrows sit on the photo's edges, whatever its size. */}
        <div style={{ position: "relative", display: "inline-flex", maxWidth: "100%" }}>
          {/* Remote, arbitrary-size suggestion; next/image would need every host allow-listed. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={photo.url}
            src={photo.url}
            alt={photo.credit}
            style={{
              maxWidth: "100%",
              maxHeight: "68vh",
              objectFit: "contain",
              borderRadius: "var(--radius-md)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
              background: "rgba(255,255,255,0.06)",
            }}
          />
          {count > 1 && (
            <>
              <button type="button" aria-label="Previous photo" onClick={() => step(-1)} style={{ ...arrowStyle, left: 8 }}>
                ‹
              </button>
              <button type="button" aria-label="Next photo" onClick={() => step(1)} style={{ ...arrowStyle, right: 8 }}>
                ›
              </button>
            </>
          )}
        </div>
      </div>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "12px",
          color: "rgba(255,255,255,0.75)",
          fontSize: "12px",
          textAlign: "center",
          maxWidth: 520,
        }}
      >
        <span>
          {index + 1} / {count} · Photo:{" "}
          {photo.creditUrl ? (
            <a href={photo.creditUrl} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
              {photo.credit}
            </a>
          ) : (
            photo.credit
          )}
        </span>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={onClose}
            style={{ background: "transparent", color: "#fff", border: "1.5px solid rgba(255,255,255,0.4)" }}
          >
            Back
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              onUse(photo.url);
              onClose();
            }}
            disabled={isSelected}
          >
            {isSelected ? "✓ Current photo" : "Use this photo"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
