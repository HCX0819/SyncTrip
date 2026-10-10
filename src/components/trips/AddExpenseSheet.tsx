"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { Expense, SavedPlace, TripMember } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import {
  centsToInput,
  formatMoney,
  parseMoney,
  splitByWeights,
  splitEvenly,
  type ShareInput,
} from "@/lib/settle";

type SplitMode = "even" | "exact" | "weights";

interface Props {
  tripId: string;
  currency: string;
  members: TripMember[];
  places: SavedPlace[];
  currentUserId: string;
  /** Set when editing an existing expense. */
  expense?: Expense | null;
  onClose: () => void;
  onSaved: () => void;
}

const CATEGORIES = ["Food", "Transport", "Lodging", "Activities", "Shopping", "Other"];

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  color: "var(--text-muted)",
  marginBottom: "6px",
  letterSpacing: "0.08em",
};

function memberName(m: TripMember) {
  return m.profile?.display_name || "Traveller";
}

function todayLocal() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Opens an existing expense in "even" mode when its shares are exactly what an
// even split would produce, otherwise in "exact" mode with the stored amounts.
function initialSplit(expense: Expense | null | undefined, memberIds: string[], currency: string) {
  const shares = expense?.expense_shares ?? [];
  if (!expense || shares.length === 0) {
    return { mode: "even" as SplitMode, selected: memberIds, exact: {} };
  }
  const ids = memberIds.filter((id) => shares.some((s) => s.user_id === id));
  const even = splitEvenly(expense.amount_cents, ids, expense.paid_by);
  const matchesEven =
    ids.length === shares.length &&
    even.every((e) => shares.find((s) => s.user_id === e.user_id)?.amount_cents === e.amount_cents);
  return {
    mode: (matchesEven ? "even" : "exact") as SplitMode,
    selected: ids,
    exact: Object.fromEntries(shares.map((s) => [s.user_id, centsToInput(s.amount_cents, currency)])),
  };
}

export default function AddExpenseSheet({
  tripId,
  currency,
  members,
  places,
  currentUserId,
  expense,
  onClose,
  onSaved,
}: Props) {
  const supabase = createClient();
  const memberIds = members.map((m) => m.user_id);
  const isEdit = !!expense;

  const [initial] = useState(() => initialSplit(expense, memberIds, currency));
  const isSettlement = expense?.is_settlement ?? false;

  const [description, setDescription] = useState(expense?.description ?? "");
  const [amountInput, setAmountInput] = useState(expense ? centsToInput(expense.amount_cents, currency) : "");
  const [paidBy, setPaidBy] = useState(
    expense?.paid_by && memberIds.includes(expense.paid_by) ? expense.paid_by : currentUserId
  );
  const [spentOn, setSpentOn] = useState(expense?.spent_on ?? todayLocal());
  const [category, setCategory] = useState(expense?.category ?? "");
  const [placeId, setPlaceId] = useState(expense?.place_id ?? "");
  const [mode, setMode] = useState<SplitMode>(initial.mode);
  const [selected, setSelected] = useState<string[]>(initial.selected);
  const [exact, setExact] = useState<Record<string, string>>(initial.exact);
  const [weights, setWeights] = useState<Record<string, string>>(() =>
    Object.fromEntries(memberIds.map((id) => [id, "1"]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountCents = parseMoney(amountInput, currency);

  // Shares for the current mode, plus a message when they don't work out.
  let shares: ShareInput[] = [];
  let splitError: string | null = null;
  if (amountCents === null || amountCents <= 0) {
    splitError = amountInput.trim() ? "Enter a valid amount." : null;
  } else if (mode === "even") {
    const ids = memberIds.filter((id) => selected.includes(id));
    shares = splitEvenly(amountCents, ids, paidBy);
    if (ids.length === 0) splitError = "Pick at least one person to split with.";
  } else if (mode === "exact") {
    const parsed = memberIds.map((id) => {
      const raw = exact[id] ?? "";
      return { user_id: id, cents: raw.trim() ? parseMoney(raw, currency) : 0 };
    });
    const invalid = parsed.some((p) => p.cents === null);
    shares = parsed.map((p) => ({ user_id: p.user_id, amount_cents: p.cents ?? 0 }));
    const sum = shares.reduce((s, x) => s + x.amount_cents, 0);
    if (invalid) splitError = "One of the amounts isn't a valid number.";
    else if (sum !== amountCents) {
      const diff = amountCents - sum;
      splitError =
        diff > 0
          ? `${formatMoney(diff, currency)} left to assign.`
          : `${formatMoney(-diff, currency)} over the total.`;
    }
  } else {
    const parsed = memberIds.map((id) => ({ user_id: id, weight: Number(weights[id] || 0) }));
    if (parsed.some((w) => !Number.isFinite(w.weight) || w.weight < 0)) {
      splitError = "Shares must be zero or more.";
    } else {
      shares = splitByWeights(amountCents, parsed, paidBy);
      if (shares.length === 0) splitError = "Give at least one person a share.";
    }
  }
  if (!splitError && isSettlement && shares.filter((s) => s.amount_cents > 0).length !== 1) {
    splitError = "A payment goes to exactly one person.";
  }
  const sharesById = new Map(shares.map((s) => [s.user_id, s.amount_cents]));
  const canSave = !saving && description.trim() !== "" && amountCents !== null && amountCents > 0 && !splitError;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave || amountCents === null) return;
    setSaving(true);
    setError(null);
    const { error } = await supabase.rpc("save_expense", {
      p_trip_id: tripId,
      p_expense_id: expense?.id ?? null,
      p_description: description.trim(),
      p_amount_cents: amountCents,
      p_paid_by: paidBy,
      p_spent_on: spentOn || null,
      p_category: category || null,
      p_place_id: placeId || null,
      p_is_settlement: isSettlement,
      // Zero shares carry no information; leave them out.
      p_shares: shares.filter((s) => s.amount_cents > 0),
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    onSaved();
  }

  const modeButton = (value: SplitMode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      style={{
        flex: 1,
        padding: "8px 6px",
        fontSize: "13px",
        borderRadius: "var(--radius-sm)",
        border: mode === value ? "1.5px solid var(--blue)" : "1px solid var(--border-strong)",
        background: mode === value ? "var(--blue-light)" : "var(--surface)",
        color: mode === value ? "var(--blue)" : "var(--text-muted)",
        fontWeight: mode === value ? 600 : 400,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

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
            marginBottom: "20px",
          }}
        >
          {isEdit ? (isSettlement ? "Edit payment" : "Edit expense") : "Add expense"}
        </h2>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label htmlFor="expense-description" style={labelStyle}>
              DESCRIPTION *
            </label>
            <input
              id="expense-description"
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Dinner, train tickets…"
              maxLength={200}
              required
            />
          </div>

          <div style={{ display: "flex", gap: "12px" }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="expense-amount" style={labelStyle}>
                AMOUNT ({currency}) *
              </label>
              <input
                id="expense-amount"
                className="input"
                inputMode="decimal"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="expense-date" style={labelStyle}>
                DATE
              </label>
              <input
                id="expense-date"
                className="input"
                type="date"
                value={spentOn}
                onChange={(e) => setSpentOn(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px" }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="expense-paid-by" style={labelStyle}>
                PAID BY
              </label>
              <select
                id="expense-paid-by"
                className="input"
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
              >
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {memberName(m)}
                    {m.user_id === currentUserId ? " (you)" : ""}
                  </option>
                ))}
              </select>
            </div>
            {!isSettlement && (
              <div style={{ flex: 1 }}>
                <label htmlFor="expense-category" style={labelStyle}>
                  CATEGORY
                </label>
                <select
                  id="expense-category"
                  className="input"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">None</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  {category && !CATEGORIES.includes(category) && <option value={category}>{category}</option>}
                </select>
              </div>
            )}
          </div>

          {places.length > 0 && !isSettlement && (
            <div>
              <label htmlFor="expense-place" style={labelStyle}>
                LINKED PLACE
              </label>
              <select
                id="expense-place"
                className="input"
                value={placeId}
                onChange={(e) => setPlaceId(e.target.value)}
              >
                <option value="">None</option>
                {places.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Split */}
          <div>
            <label style={labelStyle}>{isSettlement ? "PAID TO" : "SPLIT"}</label>
            {!isSettlement && (
              <div style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
                {modeButton("even", "Evenly")}
                {modeButton("exact", "Exact amounts")}
                {modeButton("weights", "By shares")}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {members.map((m) => {
                const id = m.user_id;
                const share = sharesById.get(id) ?? 0;
                return (
                  <div key={id} style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: 40 }}>
                    {mode === "even" ? (
                      <label
                        style={{ flex: 1, display: "flex", alignItems: "center", gap: "10px", fontSize: "14px", cursor: "pointer" }}
                      >
                        <input
                          type="checkbox"
                          checked={selected.includes(id)}
                          onChange={(e) =>
                            setSelected((prev) =>
                              e.target.checked ? [...prev, id] : prev.filter((x) => x !== id)
                            )
                          }
                        />
                        {memberName(m)}
                        {id === currentUserId && <span style={{ color: "var(--text-muted)" }}>(you)</span>}
                      </label>
                    ) : (
                      <span style={{ flex: 1, fontSize: "14px" }}>
                        {memberName(m)}
                        {id === currentUserId && <span style={{ color: "var(--text-muted)" }}> (you)</span>}
                      </span>
                    )}

                    {mode === "exact" && (
                      <input
                        className="input"
                        inputMode="decimal"
                        aria-label={`Amount for ${memberName(m)}`}
                        value={exact[id] ?? ""}
                        onChange={(e) => setExact((prev) => ({ ...prev, [id]: e.target.value }))}
                        placeholder="0"
                        style={{ width: 110, padding: "8px 12px", textAlign: "right" }}
                      />
                    )}
                    {mode === "weights" && (
                      <input
                        className="input"
                        type="number"
                        min={0}
                        step="any"
                        aria-label={`Shares for ${memberName(m)}`}
                        value={weights[id] ?? ""}
                        onChange={(e) => setWeights((prev) => ({ ...prev, [id]: e.target.value }))}
                        style={{ width: 80, padding: "8px 12px", textAlign: "right" }}
                      />
                    )}
                    {mode !== "exact" && (
                      <span
                        style={{
                          width: 90,
                          textAlign: "right",
                          fontSize: "13px",
                          color: share > 0 ? "var(--text)" : "var(--text-light)",
                        }}
                      >
                        {formatMoney(share, currency)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {splitError ? (
              <p style={{ color: "var(--red)", fontSize: "13px", marginTop: "10px" }}>{splitError}</p>
            ) : (
              amountCents !== null &&
              amountCents > 0 && (
                <p style={{ color: "var(--green)", fontSize: "13px", marginTop: "10px" }}>
                  Adds up to {formatMoney(amountCents, currency)} ✓
                </p>
              )
            )}
          </div>

          {error && <p style={{ color: "var(--red)", fontSize: "13px" }}>{error}</p>}

          <button id="save-expense-btn" type="submit" className="btn btn-primary btn-full" disabled={!canSave}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add expense"}
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
}
