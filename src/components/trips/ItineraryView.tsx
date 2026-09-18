"use client";

import { useEffect, useState, useTransition } from "react";
import type { Trip, SavedPlace, ItineraryItem } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

interface Props {
  trip: Trip;
  places: SavedPlace[];
  onUpdate: () => void;
}

export default function ItineraryView({ trip, places, onUpdate }: Props) {
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDay, setActiveDay] = useState(1);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [isPending, startTransition] = useTransition();

  const supabase = createClient();

  // Calculate days count
  const calculateDays = () => {
    if (!trip.start_date || !trip.end_date) return 3; // Default 3 days
    const start = new Date(trip.start_date);
    const end = new Date(trip.end_date);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(1, Math.min(diffDays, 30));
  };

  const totalDays = calculateDays();

  useEffect(() => {
    async function loadItinerary() {
      setLoading(true);
      const { data } = await supabase
        .from("itinerary_items")
        .select("*, place:saved_places(*)")
        .eq("trip_id", trip.id)
        .order("sort_order", { ascending: true });
      if (data) {
        setItems(data as ItineraryItem[]);
      }
      setLoading(false);
    }
    loadItinerary();
  }, [trip.id]);

  const currentDayItems = items.filter((item) => item.day_index === activeDay);
  const assignedPlaceIds = new Set(items.map((i) => i.place_id));
  const unassignedPlaces = places.filter((p) => !assignedPlaceIds.has(p.id));

  async function assignPlaceToDay(placeId: string, dayIndex: number) {
    startTransition(async () => {
      const nextSortOrder =
        items.filter((i) => i.day_index === dayIndex).length + 1;

      const { data, error } = await supabase
        .from("itinerary_items")
        .insert({
          trip_id: trip.id,
          place_id: placeId,
          day_index: dayIndex,
          sort_order: nextSortOrder,
        })
        .select("*, place:saved_places(*)")
        .single();

      if (!error && data) {
        setItems((prev) => [...prev, data as ItineraryItem]);
        setShowAssignModal(false);
        onUpdate();
      }
    });
  }

  async function removeItem(itemId: string) {
    startTransition(async () => {
      await supabase.from("itinerary_items").delete().eq("id", itemId);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      onUpdate();
    });
  }

  return (
    <div
      style={{
        height: "calc(100dvh - 160px)",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
      }}
    >
      {/* Day Selector Pills */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          padding: "16px 20px",
          overflowX: "auto",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        {Array.from({ length: totalDays }, (_, i) => i + 1).map((day) => {
          const dayItemsCount = items.filter((item) => item.day_index === day).length;
          return (
            <button
              key={day}
              onClick={() => setActiveDay(day)}
              style={{
                padding: "8px 16px",
                borderRadius: "99px",
                border: "1px solid",
                borderColor: activeDay === day ? "var(--accent)" : "var(--border)",
                background: activeDay === day ? "var(--accent-dim)" : "transparent",
                color: activeDay === day ? "var(--accent)" : "var(--text-muted)",
                fontSize: "13px",
                fontWeight: activeDay === day ? 600 : 400,
                cursor: "pointer",
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                transition: "all 0.15s",
              }}
            >
              <span>Day {day}</span>
              {dayItemsCount > 0 && (
                <span
                  style={{
                    background: activeDay === day ? "var(--accent)" : "var(--surface-2)",
                    color: activeDay === day ? "#fffdf9" : "var(--text-muted)",
                    borderRadius: "50%",
                    width: "18px",
                    height: "18px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "11px",
                    fontWeight: 700,
                  }}
                >
                  {dayItemsCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Day Schedule Content */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px 20px calc(var(--tab-height) + 80px)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
          }}
        >
          <div>
            <h2
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: "22px",
                fontWeight: 400,
              }}
            >
              Day {activeDay}
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>
              {currentDayItems.length}{" "}
              {currentDayItems.length === 1 ? "activity" : "activities"} scheduled
            </p>
          </div>
          <button
            id="add-to-day-btn"
            className="btn btn-primary btn-sm"
            onClick={() => setShowAssignModal(true)}
          >
            + Add Spot
          </button>
        </div>

        {loading ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-muted)" }}>
            Loading itinerary…
          </div>
        ) : currentDayItems.length === 0 ? (
          <div
            style={{
              padding: "48px 24px",
              textAlign: "center",
              border: "1px dashed var(--border)",
              borderRadius: "var(--radius-lg)",
              background: "rgba(245,241,234,0.03)",
            }}
          >
            <div style={{ fontSize: "32px", marginBottom: "12px", opacity: 0.4 }}>📅</div>
            <p
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: "17px",
                marginBottom: "6px",
              }}
            >
              Day {activeDay} is empty
            </p>
            <p style={{ color: "var(--text-muted)", fontSize: "13px", marginBottom: "20px" }}>
              Choose places from your saved moodboard to schedule this day.
            </p>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowAssignModal(true)}
            >
              Select places
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {currentDayItems.map((item, index) => {
              const place = item.place ?? places.find((p) => p.id === item.place_id);
              if (!place) return null;

              return (
                <div
                  key={item.id}
                  className="card"
                  style={{
                    padding: "14px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: "14px",
                  }}
                >
                  <div
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "50%",
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "var(--accent)",
                      flexShrink: 0,
                    }}
                  >
                    {index + 1}
                  </div>

                  {place.photo_url && (
                    <div
                      style={{
                        width: "48px",
                        height: "48px",
                        borderRadius: "var(--radius-sm)",
                        backgroundImage: `url(${place.photo_url})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        flexShrink: 0,
                      }}
                    />
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <h4
                        style={{
                          fontSize: "15px",
                          fontWeight: 500,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {place.title}
                      </h4>
                      <span
                        className={`badge-${place.category}`}
                        style={{
                          fontSize: "10px",
                          padding: "2px 6px",
                          borderRadius: "99px",
                          flexShrink: 0,
                        }}
                      >
                        {place.category}
                      </span>
                    </div>
                    {place.address && (
                      <p
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "12px",
                          marginTop: "2px",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        📍 {place.address}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => removeItem(item.id)}
                    disabled={isPending}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-muted)",
                      fontSize: "18px",
                      cursor: "pointer",
                      padding: "4px 8px",
                      borderRadius: "var(--radius-sm)",
                      transition: "color 0.15s",
                    }}
                    title="Remove from Day"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Assign Place Modal */}
      {showAssignModal && (
        <div className="modal-backdrop" onClick={() => setShowAssignModal(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <h3
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: "20px",
                fontWeight: 400,
                marginBottom: "8px",
              }}
            >
              Add to Day {activeDay}
            </h3>
            <p style={{ color: "var(--text-muted)", fontSize: "13px", marginBottom: "20px" }}>
              Select a saved place from your trip moodboard.
            </p>

            {places.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-muted)" }}>
                No places saved in this trip yet. Add places to your moodboard first!
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "50vh", overflowY: "auto" }}>
                {places.map((place) => {
                  const isAlreadyInCurrentDay = currentDayItems.some((i) => i.place_id === place.id);
                  return (
                    <div
                      key={place.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "12px 14px",
                        background: "var(--surface-2)",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0, paddingRight: "10px" }}>
                        <p style={{ fontSize: "14px", fontWeight: 500 }}>{place.title}</p>
                        <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                          {place.category.toUpperCase()} {place.address ? `• ${place.address}` : ""}
                        </p>
                      </div>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={isAlreadyInCurrentDay || isPending}
                        onClick={() => assignPlaceToDay(place.id, activeDay)}
                      >
                        {isAlreadyInCurrentDay ? "Added" : "Add"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
