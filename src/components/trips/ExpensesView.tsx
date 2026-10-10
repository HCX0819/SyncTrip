"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Expense, SavedPlace, Trip, TripMember } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { formatTripDate } from "@/lib/dates";
import { computeBalances, formatMoney, settleUp, type Transfer } from "@/lib/settle";
import AddExpenseSheet from "./AddExpenseSheet";

interface Props {
  trip: Trip;
  members: TripMember[];
  places: SavedPlace[];
  currentUserId: string;
  syncTick?: number;
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--text-muted)",
  letterSpacing: "0.08em",
  marginBottom: "10px",
};

const cardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  padding: "14px 16px",
};

function todayLocal() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function ExpensesView({ trip, members, places, currentUserId, syncTick }: Props) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // undefined = sheet closed, null = adding, Expense = editing.
  const [editing, setEditing] = useState<Expense | null | undefined>(undefined);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [supabase] = useState(() => createClient());

  const currency = trip.currency ?? "USD";
  const isOwner = members.some((m) => m.user_id === currentUserId && m.role === "owner");
  const money = (cents: number) => formatMoney(cents, currency);

  const nameOf = (userId: string | null) => {
    if (!userId) return "Former member";
    if (userId === currentUserId) return "You";
    const m = members.find((x) => x.user_id === userId);
    return m ? m.profile?.display_name || "Traveller" : "Former member";
  };

  const fetchExpenses = useCallback(async () => {
    const { data, error } = await supabase
      .from("expenses")
      .select("*, expense_shares(*)")
      .eq("trip_id", trip.id)
      .order("spent_on", { ascending: false })
      .order("created_at", { ascending: false });
    return error ? null : ((data ?? []) as Expense[]);
  }, [supabase, trip.id]);

  const reload = useCallback(async () => {
    const data = await fetchExpenses();
    if (data) setExpenses(data);
  }, [fetchExpenses]);

  useEffect(() => {
    let cancelled = false;
    fetchExpenses().then((data) => {
      if (cancelled) return;
      if (data) setExpenses(data);
      else setError("Couldn't load expenses.");
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchExpenses]);

  // Reload whenever syncTick changes (not on mount — the effect above covers that).
  const lastTickRef = useRef(syncTick);
  useEffect(() => {
    if (syncTick === lastTickRef.current) return;
    lastTickRef.current = syncTick;
    reload();
  }, [syncTick, reload]);

  const shares = expenses.flatMap((e) => e.expense_shares ?? []);
  const balances = computeBalances(expenses, shares);
  const transfers = settleUp(balances);
  const spending = expenses.filter((e) => !e.is_settlement);
  const tripTotal = spending.reduce((sum, e) => sum + e.amount_cents, 0);
  const myShare = spending.reduce(
    (sum, e) => sum + (e.expense_shares?.find((s) => s.user_id === currentUserId)?.amount_cents ?? 0),
    0
  );
  const myBalance = balances[currentUserId] ?? 0;

  async function markPaid(t: Transfer) {
    if (!confirm(`Record that ${nameOf(t.from)} paid ${nameOf(t.to)} ${money(t.amount_cents)}?`)) return;
    const key = `${t.from}-${t.to}`;
    setBusyKey(key);
    setError(null);
    const { error } = await supabase.rpc("save_expense", {
      p_trip_id: trip.id,
      p_expense_id: null,
      p_description: "Payment",
      p_amount_cents: t.amount_cents,
      p_paid_by: t.from,
      p_spent_on: todayLocal(),
      p_category: null,
      p_place_id: null,
      p_is_settlement: true,
      p_shares: [{ user_id: t.to, amount_cents: t.amount_cents }],
    });
    setBusyKey(null);
    if (error) {
      setError(error.message);
      return;
    }
    reload();
  }

  async function handleDelete(e: Expense) {
    const label = e.is_settlement ? "this payment" : `"${e.description}"`;
    if (!confirm(`Delete ${label}? Balances will be recalculated.`)) return;
    setBusyKey(e.id);
    setError(null);
    const { error } = await supabase.rpc("delete_expense", { p_id: e.id });
    setBusyKey(null);
    if (error) {
      setError(error.message);
      return;
    }
    setExpenses((prev) => prev.filter((x) => x.id !== e.id));
  }

  // Group by day, keeping the newest-first order from the query.
  const groups: { date: string; items: Expense[] }[] = [];
  for (const e of expenses) {
    const last = groups[groups.length - 1];
    if (last && last.date === e.spent_on) last.items.push(e);
    else groups.push({ date: e.spent_on, items: [e] });
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 100px" }}>
      <div style={{ maxWidth: 600, margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px" }}>
        {/* Totals */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
          {[
            { label: "Trip total", value: money(tripTotal), color: "var(--text)" },
            { label: "Your share", value: money(myShare), color: "var(--text)" },
            {
              label: myBalance > 0 ? "You're owed" : myBalance < 0 ? "You owe" : "Balance",
              value: myBalance === 0 ? "Settled" : money(Math.abs(myBalance)),
              color: myBalance > 0 ? "var(--green)" : myBalance < 0 ? "var(--red)" : "var(--text-muted)",
            },
          ].map((t) => (
            <div key={t.label} style={{ ...cardStyle, padding: "12px" }}>
              <p style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>{t.label}</p>
              <p style={{ fontSize: "16px", fontWeight: 600, color: t.color, wordBreak: "break-word" }}>{t.value}</p>
            </div>
          ))}
        </div>

        <button
          id="add-expense-btn"
          className="btn btn-primary btn-full"
          onClick={() => setEditing(null)}
        >
          + Add expense
        </button>

        {error && <p style={{ color: "var(--red)", fontSize: "13px" }}>{error}</p>}

        {/* Who owes whom */}
        {transfers.length > 0 && (
          <div>
            <p style={sectionTitleStyle}>SETTLE UP</p>
            <div style={{ ...cardStyle, padding: "4px 16px" }}>
              {transfers.map((t, i) => {
                const key = `${t.from}-${t.to}`;
                const involvesMe = t.from === currentUserId || t.to === currentUserId;
                return (
                  <div
                    key={key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "12px 0",
                      borderTop: i === 0 ? "none" : "1px solid var(--border)",
                    }}
                  >
                    <p style={{ flex: 1, fontSize: "14px", color: "var(--text)" }}>
                      <strong style={{ fontWeight: involvesMe ? 600 : 500 }}>{nameOf(t.from)}</strong>
                      <span style={{ color: "var(--text-muted)" }}> {t.from === currentUserId ? "owe" : "owes"} </span>
                      <strong style={{ fontWeight: involvesMe ? 600 : 500 }}>{nameOf(t.to)}</strong>
                      <br />
                      <span style={{ fontSize: "15px", fontWeight: 600 }}>{money(t.amount_cents)}</span>
                    </p>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => markPaid(t)}
                      disabled={busyKey !== null}
                      style={{ flexShrink: 0 }}
                    >
                      {busyKey === key ? "Saving…" : "Mark paid"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Expense list */}
        <div>
          {loading && <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>Loading…</p>}
          {!loading && expenses.length === 0 && !error && (
            <p style={{ color: "var(--text-muted)", fontSize: "14px", textAlign: "center", padding: "24px 0" }}>
              No expenses yet. Add one and SyncTrip works out who owes whom.
            </p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {groups.map((g) => (
              <div key={g.date}>
                <p style={sectionTitleStyle}>
                  {(formatTripDate(g.date, { weekday: "short", month: "short", day: "numeric" }) ?? g.date).toUpperCase()}
                </p>
                <div style={{ ...cardStyle, padding: "4px 16px" }}>
                  {g.items.map((e, i) => {
                    const canEdit = e.created_by === currentUserId || isOwner;
                    const mine = e.expense_shares?.find((s) => s.user_id === currentUserId)?.amount_cents ?? 0;
                    const settledTo = e.is_settlement ? e.expense_shares?.[0]?.user_id ?? null : null;
                    const place = e.place_id ? places.find((p) => p.id === e.place_id) : null;
                    return (
                      <div
                        key={e.id}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "12px",
                          padding: "12px 0",
                          borderTop: i === 0 ? "none" : "1px solid var(--border)",
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p
                            style={{
                              fontSize: "14px",
                              color: e.is_settlement ? "var(--text-muted)" : "var(--text)",
                              fontStyle: e.is_settlement ? "italic" : "normal",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {e.is_settlement ? `${nameOf(e.paid_by)} paid ${nameOf(settledTo)}` : e.description}
                          </p>
                          <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                            {e.is_settlement
                              ? "Payment"
                              : [
                                  `${nameOf(e.paid_by)} paid`,
                                  e.category,
                                  place ? `📍 ${place.title}` : null,
                                  mine > 0 ? `your share ${money(mine)}` : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                          </p>
                          {canEdit && (
                            <div style={{ display: "flex", gap: "12px", marginTop: "6px" }}>
                              <button
                                type="button"
                                onClick={() => setEditing(e)}
                                disabled={busyKey !== null}
                                style={{ background: "none", border: "none", padding: 0, fontSize: "12px", color: "var(--blue)", cursor: "pointer" }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(e)}
                                disabled={busyKey !== null}
                                style={{ background: "none", border: "none", padding: 0, fontSize: "12px", color: "var(--red)", cursor: "pointer" }}
                              >
                                {busyKey === e.id ? "Deleting…" : "Delete"}
                              </button>
                            </div>
                          )}
                        </div>
                        <p style={{ fontSize: "15px", fontWeight: 600, color: "var(--text)", flexShrink: 0 }}>
                          {money(e.amount_cents)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {editing !== undefined && (
        <AddExpenseSheet
          tripId={trip.id}
          currency={currency}
          members={members}
          places={places}
          currentUserId={currentUserId}
          expense={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            reload();
          }}
        />
      )}
    </div>
  );
}
