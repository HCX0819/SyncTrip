"use client";

import { useEffect, useRef, useState } from "react";
import type { PhotoCandidate } from "@/app/api/place-photo/route";
import PhotoPreview from "./PhotoPreview";

interface Props {
  name: string;
  lat: number | null;
  lng: number | null;
  selectedUrl: string;
  onSelect: (url: string) => void;
  // Fill an empty photo with the best match, and keep replacing our own pick
  // as the name or pin changes. A photo the user chose is never replaced.
  autoPick?: boolean;
  // Wait for a tap before looking anything up (e.g. a place that already has a photo).
  startCollapsed?: boolean;
}

const DEBOUNCE_MS = 700;

export default function PhotoSuggestions({
  name,
  lat,
  lng,
  selectedUrl,
  onSelect,
  autoPick,
  startCollapsed,
}: Props) {
  const [expanded, setExpanded] = useState(!startCollapsed);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  // Results are tagged with the lookup they answer, so a stale strip stays
  // visible (marked "updating") while the next lookup runs.
  const [result, setResult] = useState<{ key: string; data: PhotoCandidate[] } | null>(null);
  const lastAutoPick = useRef<string | null>(null);
  // Read inside the effect without re-running the lookup on every selection.
  const latest = useRef({ selectedUrl, onSelect, autoPick });
  useEffect(() => {
    latest.current = { selectedUrl, onSelect, autoPick };
  });

  const query = name.trim();
  const hasPin = lat !== null && lng !== null;
  const key = expanded && (query.length >= 2 || hasPin) ? `${query}|${lat},${lng}` : null;
  const candidates = key ? (result?.data ?? []) : [];
  const loading = key !== null && result?.key !== key;

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ name: query });
      if (hasPin) {
        params.set("lat", String(lat));
        params.set("lng", String(lng));
      }
      let data: PhotoCandidate[] = [];
      try {
        const res = await fetch(`/api/place-photo?${params}`, { signal: controller.signal });
        if (res.ok) data = await res.json();
      } catch {
        // Offline or aborted: no suggestions.
      }
      if (controller.signal.aborted) return;
      setResult({ key, data });
      const { selectedUrl: current, onSelect: select, autoPick: auto } = latest.current;
      if (auto && data[0] && (!current || current === lastAutoPick.current)) {
        lastAutoPick.current = data[0].url;
        select(data[0].url);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, query, hasPin, lat, lng]);

  if (!expanded) {
    return (
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setExpanded(true)}>
        Find photos of this place
      </button>
    );
  }

  if (candidates.length === 0) {
    return loading ? (
      <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>Looking for photos…</p>
    ) : null;
  }

  const selected = candidates.find((c) => c.url === selectedUrl);

  return (
    <div>
      <p style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "6px" }}>
        Suggested photos · tap to preview {loading && <span style={{ color: "var(--accent)" }}>· updating…</span>}
      </p>
      <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "4px" }}>
        {candidates.map((c, i) => {
          const isSelected = c.url === selectedUrl;
          return (
            <button
              key={c.url}
              type="button"
              title={c.credit}
              aria-label={`Preview photo: ${c.credit}${isSelected ? " (current photo)" : ""}`}
              onClick={() => setPreviewIndex(i)}
              style={{
                width: 72,
                height: 56,
                flexShrink: 0,
                borderRadius: "var(--radius-sm)",
                backgroundImage: `url(${c.url})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundColor: "var(--surface-2)",
                border: isSelected ? "2px solid var(--accent)" : "1px solid var(--border)",
                cursor: "pointer",
                padding: 0,
              }}
            />
          );
        })}
      </div>
      {selected && (
        <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
          Photo:{" "}
          {selected.creditUrl ? (
            <a href={selected.creditUrl} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
              {selected.credit}
            </a>
          ) : (
            selected.credit
          )}
        </p>
      )}
      {previewIndex !== null && (
        <PhotoPreview
          candidates={candidates}
          index={Math.min(previewIndex, candidates.length - 1)}
          selectedUrl={selectedUrl}
          onIndexChange={setPreviewIndex}
          onUse={(url) => {
            lastAutoPick.current = null; // the user chose; stop replacing it
            onSelect(url);
          }}
          onClose={() => setPreviewIndex(null)}
        />
      )}
    </div>
  );
}
