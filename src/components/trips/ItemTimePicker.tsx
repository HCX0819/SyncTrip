"use client";

import { useState } from "react";
import { formatTimeOfDay, toTimeInput } from "@/lib/travel";

const inputStyle = {
  padding: "4px 6px",
  fontSize: "12px",
  color: "var(--text)",
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
} as const;

/** Start/end time row under an itinerary card. Times are "HH:MM" strings or null. */
export default function ItemTimePicker({
  startTime,
  endTime,
  overlapping,
  disabled,
  onSave,
}: {
  startTime?: string | null;
  endTime?: string | null;
  overlapping?: boolean;
  disabled?: boolean;
  onSave: (start: string | null, end: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const invalid = !!start && !!end && end <= start;

  function open() {
    setStart(toTimeInput(startTime));
    setEnd(toTimeInput(endTime));
    setEditing(true);
  }

  function save() {
    if (invalid) return;
    // An end time without a start can't be placed in the day; drop it.
    onSave(start || null, start && end ? end : null);
    setEditing(false);
  }

  if (!editing) {
    const startLabel = formatTimeOfDay(startTime);
    const endLabel = formatTimeOfDay(endTime);
    return (
      <button
        type="button"
        onClick={open}
        disabled={disabled}
        style={{
          background: "none",
          border: "none",
          padding: "2px 0",
          fontSize: "12px",
          color: overlapping ? "var(--red)" : "var(--text-muted)",
          cursor: "pointer",
        }}
      >
        🕘 {startLabel ? `${startLabel}${endLabel ? ` – ${endLabel}` : ""}` : "Add time"}
        {overlapping ? " · overlaps" : ""}
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px" }}>
      <input
        type="time"
        aria-label="Start time"
        value={start}
        onChange={(e) => setStart(e.target.value)}
        style={inputStyle}
      />
      <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>–</span>
      <input
        type="time"
        aria-label="End time"
        value={end}
        onChange={(e) => setEnd(e.target.value)}
        style={{ ...inputStyle, borderColor: invalid ? "var(--red)" : "var(--border)" }}
      />
      <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={invalid || disabled}>
        Save
      </button>
      {(startTime || endTime) && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            onSave(null, null);
            setEditing(false);
          }}
          disabled={disabled}
        >
          Clear
        </button>
      )}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
        Cancel
      </button>
      {invalid && (
        <span style={{ color: "var(--red)", fontSize: "12px", width: "100%" }}>End must be after start.</span>
      )}
    </div>
  );
}
