"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type HTMLAttributes, type Ref } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Trip, SavedPlace, ItineraryItem } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { tripDayCount, tripDayDate } from "@/lib/dates";

interface Props {
  trip: Trip;
  places: SavedPlace[];
  onUpdate: () => void;
  /** Bump to reload items from the server (skipped while a drag or save is in progress). */
  syncTick?: number;
}

const DAY_PREFIX = "day-";
const isDayTarget = (id: string | number) => String(id).startsWith(DAY_PREFIX);

// Day pills win when the pointer is over one; otherwise sort against the
// cards only, so the pill bar never "steals" a reorder (keyboard drags have no
// pointer and always reorder).
const collisionDetection: CollisionDetection = (args) => {
  const pillHit = pointerWithin(args).find((c) => isDayTarget(c.id));
  if (pillHit) return [pillHit];
  return closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter((c) => !isDayTarget(c.id)),
  });
};

const bySortOrder = (a: ItineraryItem, b: ItineraryItem) =>
  a.sort_order - b.sort_order || a.id.localeCompare(b.id);

// "⚠ Closed on Mondays" when the place's closed_days include the day's weekday.
function closedWarning(place: SavedPlace, date: Date | null): string | null {
  if (!date || !place.closed_days?.includes(date.getDay())) return null;
  return `⚠ Closed on ${date.toLocaleDateString("en-US", { weekday: "long" })}s`;
}

export default function ItineraryView({ trip, places, onUpdate, syncTick }: Props) {
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDay, setActiveDay] = useState(1);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [supabase] = useState(() => createClient());

  // Background syncs must not clobber an in-flight drag or optimistic save.
  const draggingRef = useRef(false);
  const savingRef = useRef(0);
  const pendingSyncRef = useRef(false);

  // Default 3 days when dates are missing; capped at 30.
  const totalDays = Math.max(1, Math.min(tripDayCount(trip.start_date, trip.end_date) ?? 3, 30));
  const currentDay = Math.min(activeDay, totalDays);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fetchItems = useCallback(async () => {
    const { data } = await supabase
      .from("itinerary_items")
      .select("*, place:saved_places(*)")
      .eq("trip_id", trip.id)
      .order("sort_order", { ascending: true });
    return (data as ItineraryItem[] | null) ?? null;
  }, [supabase, trip.id]);

  const syncFromServer = useCallback(async () => {
    if (draggingRef.current || savingRef.current > 0) {
      pendingSyncRef.current = true;
      return;
    }
    pendingSyncRef.current = false;
    const data = await fetchItems();
    // A drag may have started while the request was in flight.
    if (data && !draggingRef.current && savingRef.current === 0) setItems(data);
  }, [fetchItems]);

  useEffect(() => {
    let cancelled = false;
    fetchItems().then((data) => {
      if (cancelled) return;
      if (data) setItems(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchItems]);

  // Reload whenever syncTick changes (not on mount — the effect above covers that).
  const lastTickRef = useRef(syncTick);
  useEffect(() => {
    if (syncTick === lastTickRef.current) return;
    lastTickRef.current = syncTick;
    syncFromServer();
  }, [syncTick, syncFromServer]);

  const placeFor = (item: ItineraryItem) =>
    item.place ?? places.find((p) => p.id === item.place_id);

  const dayItems = (day: number) =>
    items.filter((i) => i.day_index === day && placeFor(i)).sort(bySortOrder);

  const currentDayItems = dayItems(currentDay);
  const currentDayDate = tripDayDate(trip.start_date, currentDay);
  const unscheduledItems = items
    .filter((i) => (i.day_index < 1 || i.day_index > totalDays) && placeFor(i))
    .sort((a, b) => a.day_index - b.day_index || bySortOrder(a, b));

  const dayLabel = (day: number) => {
    const date = tripDayDate(trip.start_date, day);
    return date
      ? `Day ${day} · ${date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`
      : `Day ${day}`;
  };
  const dayOptions = Array.from({ length: totalDays }, (_, i) => ({
    day: i + 1,
    label: dayLabel(i + 1),
  }));

  // Applies `next` locally, persists the order of `day` via RPC, and restores
  // the previous state if the server rejects it.
  async function persistDay(next: ItineraryItem[], day: number, orderedIds: string[]) {
    const previous = items;
    setItems(next);
    setError(null);
    savingRef.current += 1;
    const { error: rpcError } = await supabase.rpc("reorder_itinerary_day", {
      p_trip_id: trip.id,
      p_day_index: day,
      p_item_ids: orderedIds,
    });
    savingRef.current -= 1;
    if (rpcError) {
      setItems(previous);
      setError("Couldn't save the new order. Please try again.");
    } else {
      onUpdate();
    }
    if (savingRef.current === 0 && pendingSyncRef.current) syncFromServer();
  }

  function reorderWithinDay(activeId: string, overId: string) {
    const ids = currentDayItems.map((i) => i.id);
    const from = ids.indexOf(activeId);
    const to = ids.indexOf(overId);
    if (from < 0 || to < 0 || from === to) return;
    const orderedIds = arrayMove(ids, from, to);
    const position = new Map(orderedIds.map((id, idx) => [id, idx + 1]));
    const next = items.map((i) =>
      position.has(i.id) ? { ...i, sort_order: position.get(i.id)! } : i
    );
    persistDay(next, currentDay, orderedIds);
  }

  // Moves an item to the end of `targetDay`.
  function moveToDay(itemId: string, targetDay: number) {
    const item = items.find((i) => i.id === itemId);
    if (!item || item.day_index === targetDay) return;
    const targetIds = dayItems(targetDay).map((i) => i.id);
    const orderedIds = [...targetIds, itemId];
    const position = new Map(orderedIds.map((id, idx) => [id, idx + 1]));
    const next = items.map((i) =>
      position.has(i.id) ? { ...i, day_index: targetDay, sort_order: position.get(i.id)! } : i
    );
    persistDay(next, targetDay, orderedIds);
  }

  function endDrag() {
    draggingRef.current = false;
    setDraggingId(null);
    if (pendingSyncRef.current) syncFromServer();
  }

  function handleDragStart(event: DragStartEvent) {
    draggingRef.current = true;
    setDraggingId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    // Clear the drag flag first so persistDay's savingRef guards take over.
    draggingRef.current = false;
    setDraggingId(null);
    if (over) {
      if (isDayTarget(over.id)) {
        const targetDay = Number(String(over.id).slice(DAY_PREFIX.length));
        moveToDay(String(active.id), targetDay);
      } else if (over.id !== active.id) {
        reorderWithinDay(String(active.id), String(over.id));
      }
    }
    if (savingRef.current === 0 && pendingSyncRef.current) syncFromServer();
  }

  async function assignPlaceToDay(placeId: string, dayIndex: number) {
    startTransition(async () => {
      const nextSortOrder =
        items
          .filter((i) => i.day_index === dayIndex)
          .reduce((max, i) => Math.max(max, i.sort_order), 0) + 1;

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

  const draggingItem = draggingId ? items.find((i) => i.id === draggingId) : undefined;
  const draggingPlace = draggingItem ? placeFor(draggingItem) : undefined;

  return (
    <DndContext
      // Stable id keeps dnd-kit's generated aria ids identical on server and client.
      id={`itinerary-${trip.id}`}
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={endDrag}
    >
      <div
        style={{
          height: "calc(100dvh - 160px)",
          display: "flex",
          flexDirection: "column",
          background: "var(--bg)",
        }}
      >
        {/* Day Selector Pills — also drop targets for moving a card to another day */}
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
          {dayOptions.map(({ day, label }) => (
            <DayPill
              key={day}
              day={day}
              label={label}
              count={items.filter((item) => item.day_index === day).length}
              active={currentDay === day}
              onSelect={() => setActiveDay(day)}
            />
          ))}
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
                {dayLabel(currentDay)}
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

          {error && (
            <div
              role="alert"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                padding: "10px 14px",
                marginBottom: "16px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--accent)",
                background: "var(--accent-dim)",
                color: "var(--text)",
                fontSize: "13px",
              }}
            >
              <span>{error}</span>
              <button
                onClick={() => setError(null)}
                aria-label="Dismiss"
                style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "16px", cursor: "pointer" }}
              >
                ×
              </button>
            </div>
          )}

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
                Day {currentDay} is empty
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
            <SortableContext
              items={currentDayItems.map((i) => i.id)}
              strategy={verticalListSortingStrategy}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {currentDayItems.map((item, index) => (
                  <SortableCard
                    key={item.id}
                    item={item}
                    place={placeFor(item)!}
                    index={index}
                    warning={closedWarning(placeFor(item)!, currentDayDate)}
                    currentDay={currentDay}
                    dayOptions={dayOptions}
                    disabled={isPending}
                    onMove={(day) => moveToDay(item.id, day)}
                    onRemove={() => removeItem(item.id)}
                  />
                ))}
              </div>
            </SortableContext>
          )}

          {/* Items whose day no longer exists (e.g. the trip was shortened) */}
          {!loading && unscheduledItems.length > 0 && (
            <section style={{ marginTop: "32px" }}>
              <h3
                style={{
                  fontFamily: "var(--font-serif)",
                  fontSize: "18px",
                  fontWeight: 400,
                  marginBottom: "4px",
                }}
              >
                Unscheduled
              </h3>
              <p style={{ color: "var(--text-muted)", fontSize: "13px", marginBottom: "12px" }}>
                These were planned for days outside the current trip dates. Move them to a day.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {unscheduledItems.map((item) => (
                  <div
                    key={item.id}
                    className="card"
                    style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: "14px" }}
                  >
                    <CardBody
                      place={placeFor(item)!}
                      badge={`D${item.day_index}`}
                      currentDay={null}
                      dayOptions={dayOptions}
                      disabled={isPending}
                      onMove={(day) => moveToDay(item.id, day)}
                      onRemove={() => removeItem(item.id)}
                    />
                  </div>
                ))}
              </div>
            </section>
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
                Add to {dayLabel(currentDay)}
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
                          onClick={() => assignPlaceToDay(place.id, currentDay)}
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

      {/* Floating copy of the dragged card; position: fixed so the scroll
          container doesn't clip it when dragged up onto the day pills. */}
      <DragOverlay>
        {draggingItem && draggingPlace ? (
          <div
            className="card"
            style={{
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              gap: "14px",
              boxShadow: "var(--shadow-md, 0 8px 24px rgba(0,0,0,0.18))",
              cursor: "grabbing",
            }}
          >
            <DragHandle label={draggingPlace.title} />
            <CardBody place={draggingPlace} badge={null} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function DayPill({
  day,
  label,
  count,
  active,
  onSelect,
}: {
  day: number;
  label: string;
  count: number;
  active: boolean;
  onSelect: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${DAY_PREFIX}${day}` });
  const [dayPart, datePart] = label.split(" · ");
  const highlighted = active || isOver;

  return (
    <button
      ref={setNodeRef}
      onClick={onSelect}
      aria-label={label}
      aria-pressed={active}
      style={{
        padding: "8px 16px",
        borderRadius: "99px",
        border: "1px solid",
        borderColor: highlighted ? "var(--accent)" : "var(--border)",
        background: highlighted ? "var(--accent-dim)" : "transparent",
        color: highlighted ? "var(--accent)" : "var(--text-muted)",
        outline: isOver ? "2px dashed var(--accent)" : "none",
        outlineOffset: "2px",
        fontSize: "13px",
        fontWeight: active ? 600 : 400,
        cursor: "pointer",
        whiteSpace: "nowrap",
        display: "flex",
        alignItems: "center",
        gap: "6px",
        transition: "all 0.15s",
      }}
    >
      <span>{dayPart}</span>
      {datePart && (
        <span style={{ fontSize: "11px", fontWeight: 400, opacity: 0.8 }}>{datePart}</span>
      )}
      {count > 0 && (
        <span
          style={{
            background: active ? "var(--accent)" : "var(--surface-2)",
            color: active ? "#fffdf9" : "var(--text-muted)",
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
          {count}
        </span>
      )}
    </button>
  );
}

function SortableCard({
  item,
  place,
  index,
  warning,
  currentDay,
  dayOptions,
  disabled,
  onMove,
  onRemove,
}: {
  item: ItineraryItem;
  place: SavedPlace;
  index: number;
  warning?: string | null;
  currentDay: number;
  dayOptions: { day: number; label: string }[];
  disabled: boolean;
  onMove: (day: number) => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      className="card"
      style={{
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: "14px",
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      {/* Only the handle starts a drag, so swiping the card still scrolls */}
      <DragHandle
        label={place.title}
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
      />
      <CardBody
        place={place}
        badge={String(index + 1)}
        warning={warning}
        currentDay={currentDay}
        dayOptions={dayOptions}
        disabled={disabled}
        onMove={onMove}
        onRemove={onRemove}
      />
    </div>
  );
}

function DragHandle({
  label,
  ...rest
}: { label: string; ref?: Ref<HTMLButtonElement> } & HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={`Reorder ${label}`}
      title="Drag to reorder, or drop on a day"
      {...rest}
      style={{
        background: "none",
        border: "none",
        color: "var(--text-muted)",
        fontSize: "16px",
        letterSpacing: "-3px",
        lineHeight: 1,
        padding: "8px 6px 8px 2px",
        margin: "-8px 0 -8px -6px",
        cursor: "grab",
        touchAction: "none",
        flexShrink: 0,
      }}
    >
      ⋮⋮
    </button>
  );
}

// Shared card contents for scheduled, unscheduled and dragged cards. Controls
// (move/remove) are omitted when no handlers are given.
function CardBody({
  place,
  badge,
  warning,
  currentDay,
  dayOptions,
  disabled,
  onMove,
  onRemove,
}: {
  place: SavedPlace;
  badge: string | null;
  warning?: string | null;
  currentDay?: number | null;
  dayOptions?: { day: number; label: string }[];
  disabled?: boolean;
  onMove?: (day: number) => void;
  onRemove?: () => void;
}) {
  return (
    <>
      {badge && (
        <div
          style={{
            minWidth: "28px",
            height: "28px",
            padding: "0 4px",
            borderRadius: "99px",
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
          {badge}
        </div>
      )}

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
        {warning && (
          <p style={{ color: "var(--red)", fontSize: "12px", fontWeight: 500, marginTop: "2px" }}>{warning}</p>
        )}
      </div>

      {onMove && dayOptions && (
        <select
          aria-label={`Move ${place.title} to day`}
          value=""
          disabled={disabled}
          onChange={(e) => {
            const day = Number(e.target.value);
            if (day) onMove(day);
          }}
          style={{
            maxWidth: "84px",
            padding: "4px 6px",
            fontSize: "12px",
            color: "var(--text-muted)",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <option value="">Move…</option>
          {dayOptions
            .filter(({ day }) => day !== currentDay)
            .map(({ day, label }) => (
              <option key={day} value={day}>
                {label}
              </option>
            ))}
        </select>
      )}

      {onRemove && (
        <button
          onClick={onRemove}
          disabled={disabled}
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
      )}
    </>
  );
}
