"use client";

import { useCallback, useEffect, useRef, useState, type HTMLAttributes, type Ref } from "react";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ChecklistItem, ChecklistList, Profile, TripMember } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

interface Props {
  tripId: string;
  members: TripMember[];
  currentUserId: string;
  /** Bump to reload items from the server (skipped while a drag or save is in progress). */
  syncTick?: number;
}

const LISTS: { id: ChecklistList; label: string; placeholder: string }[] = [
  { id: "packing", label: "Packing", placeholder: "Add something to pack…" },
  { id: "todo", label: "To-do", placeholder: "Add a to-do…" },
];

// Offered in one tap while the packing list is empty.
const SUGGESTED_PACKING = [
  "Passport / ID",
  "Phone charger",
  "Power adapter",
  "Toiletries",
  "Medications",
  "Travel insurance documents",
  "Headphones",
  "Reusable water bottle",
];

const bySortOrder = (a: ChecklistItem, b: ChecklistItem) =>
  a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);

export default function ListsView({ tripId, members, currentUserId, syncTick }: Props) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyMine, setOnlyMine] = useState(false);
  const [drafts, setDrafts] = useState<Record<ChecklistList, string>>({ packing: "", todo: "" });
  const [adding, setAdding] = useState<ChecklistList | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [supabase] = useState(() => createClient());

  // Background syncs must not clobber an in-flight drag or optimistic save.
  const draggingRef = useRef(false);
  const savingRef = useRef(0);
  const pendingSyncRef = useRef(false);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fetchItems = useCallback(async () => {
    const { data } = await supabase
      .from("checklist_items")
      .select("*")
      .eq("trip_id", tripId)
      .order("sort_order", { ascending: true });
    return (data as ChecklistItem[] | null) ?? null;
  }, [supabase, tripId]);

  const syncFromServer = useCallback(async () => {
    if (draggingRef.current || savingRef.current > 0) {
      pendingSyncRef.current = true;
      return;
    }
    pendingSyncRef.current = false;
    const data = await fetchItems();
    // A drag or save may have started while the request was in flight.
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

  const profileFor = (userId: string | null): Profile | undefined =>
    userId ? members.find((m) => m.user_id === userId)?.profile : undefined;

  const listItems = (list: ChecklistList) =>
    items
      .filter((i) => i.list === list && (!onlyMine || i.assignee_id === currentUserId))
      .sort(bySortOrder);

  const nextSortOrder = (list: ChecklistList) =>
    items.filter((i) => i.list === list).reduce((max, i) => Math.max(max, i.sort_order), 0) + 1;

  // Applies `next` locally, runs `save`, and restores the previous state if
  // the server rejects it.
  async function optimistic(
    next: ChecklistItem[],
    save: () => PromiseLike<{ error: unknown }>,
    message: string
  ) {
    const previous = items;
    setItems(next);
    setError(null);
    savingRef.current += 1;
    const { error: saveError } = await save();
    savingRef.current -= 1;
    if (saveError) {
      setItems(previous);
      setError(message);
    }
    if (savingRef.current === 0 && pendingSyncRef.current) syncFromServer();
  }

  async function insertItems(list: ChecklistList, titles: string[]) {
    const start = nextSortOrder(list);
    setAdding(list);
    setError(null);
    savingRef.current += 1;
    const { data, error: insertError } = await supabase
      .from("checklist_items")
      .insert(titles.map((title, idx) => ({ trip_id: tripId, list, title, sort_order: start + idx })))
      .select("*");
    savingRef.current -= 1;
    setAdding(null);
    if (insertError || !data) {
      setError("Couldn't add that. Please try again.");
    } else {
      setItems((prev) => [...prev, ...(data as ChecklistItem[])]);
    }
    if (savingRef.current === 0 && pendingSyncRef.current) syncFromServer();
    return !insertError;
  }

  async function addFromDraft(list: ChecklistList) {
    const title = drafts[list].trim().slice(0, 200);
    if (!title) return;
    setDrafts((d) => ({ ...d, [list]: "" }));
    const ok = await insertItems(list, [title]);
    // Give the text back so it isn't lost.
    if (!ok) setDrafts((d) => ({ ...d, [list]: title }));
  }

  function toggleDone(item: ChecklistItem) {
    const done = !item.done;
    optimistic(
      items.map((i) => (i.id === item.id ? { ...i, done, done_by: done ? currentUserId : null } : i)),
      () => supabase.from("checklist_items").update({ done }).eq("id", item.id),
      "Couldn't update that item. Please try again."
    );
  }

  function assign(item: ChecklistItem, assigneeId: string | null) {
    setPickerFor(null);
    if (item.assignee_id === assigneeId) return;
    optimistic(
      items.map((i) => (i.id === item.id ? { ...i, assignee_id: assigneeId } : i)),
      () => supabase.from("checklist_items").update({ assignee_id: assigneeId }).eq("id", item.id),
      "Couldn't assign that item. Please try again."
    );
  }

  function removeItem(item: ChecklistItem) {
    optimistic(
      items.filter((i) => i.id !== item.id),
      () => supabase.from("checklist_items").delete().eq("id", item.id),
      "Couldn't delete that item. Please try again."
    );
  }

  function handleDragStart() {
    draggingRef.current = true;
    setPickerFor(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    // Clear the drag flag first so optimistic()'s savingRef guards take over.
    draggingRef.current = false;
    const moved = items.find((i) => i.id === active.id);
    if (moved && over && over.id !== active.id) {
      // Drags only reorder within one list; the filter is off whenever dragging is enabled.
      const ids = listItems(moved.list).map((i) => i.id);
      const from = ids.indexOf(String(active.id));
      const to = ids.indexOf(String(over.id));
      if (from >= 0 && to >= 0) {
        const orderedIds = arrayMove(ids, from, to);
        const position = new Map(orderedIds.map((id, idx) => [id, idx + 1]));
        optimistic(
          items.map((i) => (position.has(i.id) ? { ...i, sort_order: position.get(i.id)! } : i)),
          () =>
            supabase.rpc("reorder_checklist", {
              p_trip_id: tripId,
              p_list: moved.list,
              p_item_ids: orderedIds,
            }),
          "Couldn't save the new order. Please try again."
        );
        return;
      }
    }
    if (savingRef.current === 0 && pendingSyncRef.current) syncFromServer();
  }

  function handleDragCancel() {
    draggingRef.current = false;
    if (pendingSyncRef.current) syncFromServer();
  }

  return (
    <DndContext
      // Stable id keeps dnd-kit's generated aria ids identical on server and client.
      id={`lists-${tripId}`}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          background: "var(--bg)",
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
          <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "22px", fontWeight: 400 }}>Lists</h2>
          <button
            id="lists-only-mine"
            className="btn btn-ghost btn-sm"
            aria-pressed={onlyMine}
            onClick={() => setOnlyMine((v) => !v)}
            style={
              onlyMine
                ? { borderColor: "var(--blue)", color: "var(--blue)", fontWeight: 600 }
                : undefined
            }
          >
            {onlyMine ? "✓ Only mine" : "Only mine"}
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
            Loading lists…
          </div>
        ) : (
          LISTS.map(({ id: list, label, placeholder }) => {
            const visible = listItems(list);
            const doneCount = visible.filter((i) => i.done).length;
            const listIsEmpty = !items.some((i) => i.list === list);
            return (
              <section key={list} style={{ marginBottom: "32px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "12px" }}>
                  <h3 style={{ fontFamily: "var(--font-serif)", fontSize: "18px", fontWeight: 400 }}>{label}</h3>
                  <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>
                    {doneCount}/{visible.length}
                  </span>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addFromDraft(list);
                  }}
                  style={{ display: "flex", gap: "8px", marginBottom: "12px" }}
                >
                  <input
                    id={`lists-add-${list}`}
                    className="input"
                    value={drafts[list]}
                    maxLength={200}
                    placeholder={placeholder}
                    aria-label={placeholder}
                    onChange={(e) => setDrafts((d) => ({ ...d, [list]: e.target.value }))}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    disabled={!drafts[list].trim() || adding === list}
                  >
                    Add
                  </button>
                </form>

                {list === "packing" && listIsEmpty && (
                  <button
                    id="lists-add-suggested"
                    className="btn btn-ghost btn-sm"
                    disabled={adding === list}
                    onClick={() => insertItems("packing", SUGGESTED_PACKING)}
                    style={{ marginBottom: "12px" }}
                  >
                    ✨ Add suggested packing items
                  </button>
                )}

                {visible.length === 0 ? (
                  <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>
                    {onlyMine && !listIsEmpty ? "Nothing assigned to you here." : "Nothing here yet."}
                  </p>
                ) : (
                  <SortableContext items={visible.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {visible.map((item) => (
                        <SortableRow
                          key={item.id}
                          item={item}
                          draggable={!onlyMine}
                          assignee={profileFor(item.assignee_id)}
                          doneBy={item.done_by === currentUserId ? "you" : profileFor(item.done_by)?.display_name ?? null}
                          pickerOpen={pickerFor === item.id}
                          members={members}
                          onToggle={() => toggleDone(item)}
                          onTogglePicker={() => setPickerFor((cur) => (cur === item.id ? null : item.id))}
                          onAssign={(userId) => assign(item, userId)}
                          onRemove={() => removeItem(item)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                )}
              </section>
            );
          })
        )}
      </div>
    </DndContext>
  );
}

function SortableRow({
  item,
  draggable,
  assignee,
  doneBy,
  pickerOpen,
  members,
  onToggle,
  onTogglePicker,
  onAssign,
  onRemove,
}: {
  item: ChecklistItem;
  draggable: boolean;
  assignee: Profile | undefined;
  doneBy: string | null;
  pickerOpen: boolean;
  members: TripMember[];
  onToggle: () => void;
  onTogglePicker: () => void;
  onAssign: (userId: string | null) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, disabled: !draggable });

  return (
    <div
      ref={setNodeRef}
      className="card"
      style={{
        padding: "10px 12px",
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        position: "relative",
        zIndex: isDragging ? 1 : undefined,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        {/* Only the handle starts a drag, so swiping the row still scrolls */}
        {draggable && (
          <DragHandle label={item.title} ref={setActivatorNodeRef} {...attributes} {...listeners} />
        )}
        <input
          type="checkbox"
          checked={item.done}
          onChange={onToggle}
          aria-label={`Mark ${item.title} as ${item.done ? "not done" : "done"}`}
          style={{ width: 18, height: 18, accentColor: "var(--blue)", flexShrink: 0, cursor: "pointer" }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: "14px",
              color: item.done ? "var(--text-muted)" : "var(--text)",
              textDecoration: item.done ? "line-through" : "none",
              overflowWrap: "anywhere",
            }}
          >
            {item.title}
          </p>
          {item.done && doneBy && (
            <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>Done by {doneBy}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onTogglePicker}
          aria-label={assignee ? `Assigned to ${assignee.display_name ?? "a member"}. Change` : "Assign"}
          aria-expanded={pickerOpen}
          title={assignee ? `Assigned to ${assignee.display_name ?? "a member"}` : "Assign"}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", flexShrink: 0 }}
        >
          <Avatar profile={assignee} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Delete ${item.title}`}
          title="Delete"
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            fontSize: "18px",
            cursor: "pointer",
            padding: "4px 6px",
            borderRadius: "var(--radius-sm)",
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>

      {pickerOpen && (
        <div
          role="group"
          aria-label="Assign to"
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "8px",
            marginTop: "10px",
            paddingTop: "10px",
            borderTop: "1px solid var(--border)",
          }}
        >
          {members.map((m) => {
            const selected = item.assignee_id === m.user_id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onAssign(m.user_id)}
                aria-pressed={selected}
                title={m.profile?.display_name ?? "Member"}
                style={{
                  background: "none",
                  border: "none",
                  padding: 2,
                  borderRadius: "50%",
                  outline: selected ? "2px solid var(--blue)" : "none",
                  cursor: "pointer",
                }}
              >
                <Avatar profile={m.profile} />
              </button>
            );
          })}
          {item.assignee_id && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAssign(null)}>
              Unassign
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Initial with the photo layered on top, like the member avatars in the trip header.
function Avatar({ profile }: { profile: Profile | undefined }) {
  return (
    <div
      style={{
        position: "relative",
        width: 26,
        height: 26,
        borderRadius: "50%",
        background: "var(--surface-2)",
        border: profile ? "1px solid var(--border)" : "1px dashed var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "11px",
        fontWeight: 500,
        color: "var(--text-muted)",
        overflow: "hidden",
      }}
    >
      {profile ? profile.display_name?.[0]?.toUpperCase() ?? "?" : "+"}
      {profile?.avatar_url && (
        <img
          src={profile.avatar_url}
          alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      )}
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
      title="Drag to reorder"
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
