"use client";

import { Fragment, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { Category } from "@/lib/types";
import { CATEGORY_STYLE } from "./mapStyles";

export interface ListRow {
  key: string;
  placeId: string;
  title: string;
  category: Category;
  /** Stop number in day mode. */
  number?: number;
  subtitle: string;
  hasLocation: boolean;
  /** Saved but not on any day (All mode). */
  faded?: boolean;
  yaay: number;
}

export type SheetSnap = "peek" | "half" | "full";

/** Height of the collapsed sheet: handle plus the summary line. */
export const SHEET_PEEK_PX = 64;
const SNAP_FRACTION: Record<Exclude<SheetSnap, "peek">, number> = { half: 0.45, full: 0.85 };
const NEXT_SNAP: Record<SheetSnap, SheetSnap> = { peek: "half", half: "full", full: "peek" };

interface Props {
  variant: "side" | "sheet";
  title: string;
  rows: ListRow[];
  selectedId: string | null;
  onSelect: (row: ListRow) => void;
  /** Rendered between row i and row i+1 (travel legs in day mode). */
  between?: (index: number) => ReactNode;
  /** Extra controls under the title. */
  toolbar?: ReactNode;
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
}

/** The trip's places as a list: a side panel on desktop, a swipe-up sheet on phones. */
export default function PlaceListPanel({ variant, title, rows, selectedId, onSelect, between, toolbar, snap, onSnapChange }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startHeight: number; moved: boolean } | null>(null);
  const [dragHeight, setDragHeight] = useState<number | null>(null);

  // Keep the selected row in view (e.g. after tapping a pin).
  useEffect(() => {
    if (!selectedId) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-place-id="${selectedId}"]`);
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  const containerHeight = () => rootRef.current?.parentElement?.clientHeight ?? window.innerHeight;
  const snapHeight = (s: SheetSnap) => (s === "peek" ? SHEET_PEEK_PX : Math.round(containerHeight() * SNAP_FRACTION[s]));

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startHeight: snapHeight(snap), moved: false };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const dy = drag.startY - e.clientY;
    if (Math.abs(dy) > 5) drag.moved = true;
    if (!drag.moved) return;
    setDragHeight(Math.max(SHEET_PEEK_PX, Math.min(snapHeight("full"), drag.startHeight + dy)));
  }

  function onPointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (!drag.moved || dragHeight === null) {
      onSnapChange(NEXT_SNAP[snap]);
    } else {
      const nearest = (["peek", "half", "full"] as SheetSnap[]).reduce((best, s) =>
        Math.abs(snapHeight(s) - dragHeight) < Math.abs(snapHeight(best) - dragHeight) ? s : best
      );
      onSnapChange(nearest);
    }
    setDragHeight(null);
  }

  const header = (
    <div style={{ padding: variant === "sheet" ? "0 16px 8px" : "16px 16px 8px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
        <h3 style={{ fontFamily: "var(--font-serif)", fontSize: "16px", fontWeight: 600, color: "var(--noir-text)" }}>
          {title}
        </h3>
        <span style={{ fontSize: "12px", color: "var(--noir-text-muted)", flexShrink: 0 }}>
          {rows.length} {rows.length === 1 ? "place" : "places"}
        </span>
      </div>
      {toolbar && <div style={{ marginTop: "8px" }}>{toolbar}</div>}
    </div>
  );

  const list = (
    <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: "0 8px calc(var(--tab-height) + 16px)" }}>
      {rows.length === 0 && (
        <p style={{ padding: "16px 8px", fontSize: "13px", color: "var(--noir-text-muted)" }}>Nothing to show here.</p>
      )}
      {rows.map((row, i) => (
        <Fragment key={row.key}>
          <Row row={row} selected={row.placeId === selectedId} onSelect={onSelect} />
          {i < rows.length - 1 && between?.(i)}
        </Fragment>
      ))}
    </div>
  );

  if (variant === "side") {
    return (
      <aside
        ref={rootRef}
        aria-label={title}
        style={{
          width: 320,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          background: "var(--noir-surface)",
          borderLeft: "1px solid var(--noir-border)",
          minHeight: 0,
        }}
      >
        {header}
        {list}
      </aside>
    );
  }

  const height = dragHeight ?? (snap === "peek" ? SHEET_PEEK_PX : `${SNAP_FRACTION[snap] * 100}%`);
  return (
    <div
      ref={rootRef}
      aria-label={title}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: "var(--tab-height)",
        height,
        zIndex: 12,
        display: "flex",
        flexDirection: "column",
        background: "rgba(255,253,249,0.98)",
        backdropFilter: "blur(16px)",
        borderRadius: "16px 16px 0 0",
        boxShadow: "0 -4px 20px rgba(0,0,0,0.15)",
        transition: dragHeight === null ? "height 0.25s var(--ease-out)" : "none",
      }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={snap === "full" ? "Collapse list" : "Expand list"}
        aria-expanded={snap !== "peek"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          dragRef.current = null;
          setDragHeight(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSnapChange(NEXT_SNAP[snap]);
          }
        }}
        style={{ padding: "8px 0 6px", cursor: "grab", touchAction: "none", flexShrink: 0 }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--noir-border-strong)", margin: "0 auto" }} />
      </div>
      {header}
      {snap !== "peek" || dragHeight !== null ? list : null}
    </div>
  );
}

function Row({ row, selected, onSelect }: { row: ListRow; selected: boolean; onSelect: (row: ListRow) => void }) {
  const style = CATEGORY_STYLE[row.category] ?? CATEGORY_STYLE.other;
  return (
    <button
      data-place-id={row.placeId}
      onClick={() => onSelect(row)}
      aria-current={selected || undefined}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "8px",
        border: "none",
        borderRadius: "var(--radius-md)",
        background: selected ? "var(--gold-dim)" : "transparent",
        cursor: "pointer",
        textAlign: "left",
        color: "var(--noir-text)",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 30,
          height: 30,
          flexShrink: 0,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: style.color,
          color: "#fff",
          fontSize: row.number ? "13px" : "14px",
          fontWeight: 700,
          border: `2px ${row.faded ? "dashed" : "solid"} #fff`,
          boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
          opacity: row.faded ? 0.6 : 1,
        }}
      >
        {row.number ?? style.icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: "block",
            fontSize: "14px",
            fontWeight: 500,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {row.title}
        </span>
        <span style={{ display: "block", fontSize: "12px", color: "var(--noir-text-muted)" }}>
          {row.subtitle}
          {!row.hasLocation && " · no location"}
        </span>
      </span>
      {row.yaay > 0 && (
        <span style={{ fontSize: "12px", color: "var(--gold)", fontWeight: 600, flexShrink: 0 }}>✦ {row.yaay}</span>
      )}
    </button>
  );
}
