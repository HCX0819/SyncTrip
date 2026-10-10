"use client";

import type { BookingStatus } from "@/lib/types";

// Booking status, confirmation number and closed weekdays, shared by the
// Add and Edit place modals.

export interface BookingValue {
  booking_status: BookingStatus;
  booking_ref: string;
  closed_days: number[];
}

interface Props {
  idPrefix: string;
  value: BookingValue;
  onChange: (patch: Partial<BookingValue>) => void;
}

const STATUSES: { value: BookingStatus; label: string }[] = [
  { value: "none", label: "Not needed" },
  { value: "needed", label: "Needs booking" },
  { value: "booked", label: "Booked ✅" },
];

// Index = Date.getDay() (0 = Sunday), matching saved_places.closed_days.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Shown Monday-first.
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const labelStyle = {
  display: "block",
  fontSize: "12px",
  color: "var(--text-muted)",
  marginBottom: "8px",
  letterSpacing: "0.08em",
} as const;

function pillStyle(active: boolean) {
  return {
    padding: "7px 14px",
    borderRadius: "99px",
    border: "1px solid",
    fontSize: "13px",
    cursor: "pointer",
    transition: "all 0.18s",
    background: active ? "var(--accent-dim)" : "transparent",
    borderColor: active ? "var(--accent)" : "var(--border)",
    color: active ? "var(--accent)" : "var(--text-muted)",
  } as const;
}

export default function BookingFields({ idPrefix, value, onChange }: Props) {
  function toggleDay(day: number) {
    const has = value.closed_days.includes(day);
    onChange({
      closed_days: has
        ? value.closed_days.filter((d) => d !== day)
        : [...value.closed_days, day].sort((a, b) => a - b),
    });
  }

  return (
    <>
      <div>
        <label style={labelStyle}>BOOKING</label>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              id={`${idPrefix}booking-${s.value}`}
              aria-pressed={value.booking_status === s.value}
              onClick={() => onChange({ booking_status: s.value })}
              style={pillStyle(value.booking_status === s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
        {value.booking_status === "booked" && (
          <input
            id={`${idPrefix}booking-ref`}
            className="input"
            aria-label="Booking reference"
            placeholder="Confirmation number (optional)"
            value={value.booking_ref}
            maxLength={200}
            onChange={(e) => onChange({ booking_ref: e.target.value })}
            style={{ marginTop: "10px" }}
          />
        )}
      </div>

      <div>
        <label style={labelStyle}>CLOSED ON</label>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {DISPLAY_ORDER.map((day) => (
            <button
              key={day}
              type="button"
              id={`${idPrefix}closed-${day}`}
              aria-pressed={value.closed_days.includes(day)}
              onClick={() => toggleDay(day)}
              style={{ ...pillStyle(value.closed_days.includes(day)), padding: "6px 10px", fontSize: "12px" }}
            >
              {WEEKDAYS[day]}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

/** Columns to write to saved_places from the form value. */
export function bookingColumns(value: BookingValue) {
  return {
    booking_status: value.booking_status,
    booking_ref: value.booking_status === "booked" ? value.booking_ref.trim() || null : null,
    closed_days: value.closed_days.length ? value.closed_days : null,
  };
}
