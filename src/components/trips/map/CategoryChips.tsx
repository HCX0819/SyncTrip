"use client";

import type { Category } from "@/lib/types";
import { CATEGORY_STYLE } from "./mapStyles";

const ORDER: Category[] = ["stay", "eat", "do", "other"];

/** Category filter chips, filled with each pin colour so they double as the legend. */
export default function CategoryChips({
  counts,
  hidden,
  onToggle,
}: {
  counts: Record<Category, number>;
  hidden: Set<Category>;
  onToggle: (category: Category) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Filter by category"
      className="map-chip-row"
      style={{ display: "flex", gap: "6px", overflowX: "auto", padding: "2px", scrollbarWidth: "none" }}
    >
      {ORDER.map((category) => {
        const style = CATEGORY_STYLE[category];
        const on = !hidden.has(category);
        return (
          <button
            key={category}
            onClick={() => onToggle(category)}
            aria-pressed={on}
            title={on ? `Hide ${style.label}` : `Show ${style.label}`}
            style={{
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "5px 10px 5px 6px",
              borderRadius: "99px",
              border: `1px solid ${on ? style.color : "var(--noir-border-strong)"}`,
              background: on ? style.color : "rgba(255,253,249,0.94)",
              color: on ? "#fff" : "var(--noir-text-muted)",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "var(--shadow-sm)",
              opacity: on ? 1 : 0.85,
              textDecoration: on ? "none" : "line-through",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "11px",
                background: on ? "rgba(255,255,255,0.25)" : style.color,
              }}
            >
              {style.icon}
            </span>
            {style.label}
            <span style={{ fontWeight: 400, opacity: 0.85 }}>{counts[category]}</span>
          </button>
        );
      })}
    </div>
  );
}
