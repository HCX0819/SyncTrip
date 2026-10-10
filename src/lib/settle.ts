// Expense maths. Every amount is an integer in the currency's minor unit
// ("cents"; for zero-decimal currencies like JPY one unit is one yen), so
// splits and balances never pick up floating-point drift.

export interface BalanceExpense {
  id: string;
  paid_by: string | null;
  amount_cents: number;
}

export interface BalanceShare {
  expense_id: string;
  user_id: string;
  amount_cents: number;
}

export interface Transfer {
  from: string;
  to: string;
  amount_cents: number;
}

export interface ShareInput {
  user_id: string;
  amount_cents: number;
}

/**
 * Net amount per user: what they paid minus what they owe. Positive means the
 * group owes them, negative means they owe the group. The values sum to 0.
 * Expenses whose payer deleted their account (paid_by null) are skipped
 * entirely, since crediting nobody would leave the totals unbalanced.
 */
export function computeBalances(
  expenses: BalanceExpense[],
  shares: BalanceShare[]
): Record<string, number> {
  const balances: Record<string, number> = {};
  const counted = new Set<string>();
  for (const e of expenses) {
    if (!e.paid_by) continue;
    counted.add(e.id);
    balances[e.paid_by] = (balances[e.paid_by] ?? 0) + e.amount_cents;
  }
  for (const s of shares) {
    if (!counted.has(s.expense_id)) continue;
    balances[s.user_id] = (balances[s.user_id] ?? 0) - s.amount_cents;
  }
  return balances;
}

/**
 * Turns balances into transfers by repeatedly matching the largest debtor
 * with the largest creditor. Each step settles at least one person, so there
 * are at most n - 1 transfers.
 */
export function settleUp(balances: Record<string, number>): Transfer[] {
  const debtors: { id: string; amount: number }[] = [];
  const creditors: { id: string; amount: number }[] = [];
  for (const [id, amount] of Object.entries(balances)) {
    if (amount < 0) debtors.push({ id, amount: -amount });
    else if (amount > 0) creditors.push({ id, amount });
  }

  const transfers: Transfer[] = [];
  const byAmount = (a: { id: string; amount: number }, b: { id: string; amount: number }) =>
    b.amount - a.amount || a.id.localeCompare(b.id);

  while (debtors.length && creditors.length) {
    debtors.sort(byAmount);
    creditors.sort(byAmount);
    const debtor = debtors[0];
    const creditor = creditors[0];
    const amount = Math.min(debtor.amount, creditor.amount);
    transfers.push({ from: debtor.id, to: creditor.id, amount_cents: amount });
    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount === 0) debtors.shift();
    if (creditor.amount === 0) creditors.shift();
  }
  return transfers;
}

/**
 * Splits evenly between userIds. Leftover cents go to the payer when they
 * are part of the split (they're the one who rounded), otherwise one each to
 * the first people in the list.
 */
export function splitEvenly(amountCents: number, userIds: string[], payerId: string | null): ShareInput[] {
  if (userIds.length === 0) return [];
  const base = Math.floor(amountCents / userIds.length);
  let leftover = amountCents - base * userIds.length;
  const shares = userIds.map((user_id) => ({ user_id, amount_cents: base }));
  const payerShare = shares.find((s) => s.user_id === payerId);
  if (payerShare) {
    payerShare.amount_cents += leftover;
    leftover = 0;
  }
  for (let i = 0; leftover > 0; i++, leftover--) shares[i].amount_cents += 1;
  return shares;
}

/**
 * Splits proportionally to weights (e.g. 2 shares vs 1). Users with weight 0
 * are left out. Leftover cents go to the payer when they're in the split,
 * otherwise to the largest fractional remainders.
 */
export function splitByWeights(
  amountCents: number,
  weights: { user_id: string; weight: number }[],
  payerId: string | null
): ShareInput[] {
  const active = weights.filter((w) => w.weight > 0);
  const total = active.reduce((sum, w) => sum + w.weight, 0);
  if (total <= 0) return [];

  const rows = active.map((w) => {
    const exact = (amountCents * w.weight) / total;
    return { user_id: w.user_id, amount_cents: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let leftover = amountCents - rows.reduce((sum, r) => sum + r.amount_cents, 0);

  const payerRow = rows.find((r) => r.user_id === payerId);
  if (payerRow) {
    payerRow.amount_cents += leftover;
    leftover = 0;
  }
  const byRemainder = [...rows].sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; leftover > 0; i = (i + 1) % byRemainder.length, leftover--) {
    byRemainder[i].amount_cents += 1;
  }
  return rows.map(({ user_id, amount_cents }) => ({ user_id, amount_cents }));
}

// ---------------------------------------------------------------------------
// Currency formatting
// ---------------------------------------------------------------------------

export const COMMON_CURRENCIES = [
  "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "CNY", "HKD", "SGD",
  "NZD", "SEK", "NOK", "DKK", "KRW", "INR", "THB", "IDR", "MYR", "PHP",
  "VND", "MXN", "BRL", "ZAR", "AED", "TRY",
];

function numberFormat(currency: string, options: Intl.NumberFormatOptions = {}) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, ...options });
  } catch {
    // Unknown code: fall back rather than crash the view.
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", ...options });
  }
}

/** Number of minor-unit digits for a currency (2 for USD, 0 for JPY). */
export function currencyDigits(currency: string): number {
  return numberFormat(currency).resolvedOptions().maximumFractionDigits ?? 2;
}

/** Formats minor units with the currency symbol, e.g. 1234 USD → "$12.34". */
export function formatMoney(cents: number, currency: string, options?: Intl.NumberFormatOptions): string {
  return numberFormat(currency, options).format(cents / 10 ** currencyDigits(currency));
}

/** Minor units as a plain number string for inputs, e.g. 1234 USD → "12.34". */
export function centsToInput(cents: number, currency: string): string {
  return (cents / 10 ** currencyDigits(currency)).toFixed(currencyDigits(currency));
}

/**
 * Parses what someone typed ("12", "12.5", "1,234.50") into minor units.
 * Returns null for anything that isn't a non-negative number with at most
 * the currency's number of decimals.
 */
export function parseMoney(input: string, currency: string): number | null {
  const digits = currencyDigits(currency);
  let cleaned = input.replace(/\s/g, "");
  // "12,5" / "12,50" (decimal comma) vs "1,234" (thousands separator).
  if (!cleaned.includes(".") && digits > 0 && new RegExp(`,\\d{1,${digits}}$`).test(cleaned)) {
    const i = cleaned.lastIndexOf(",");
    cleaned = cleaned.slice(0, i).replace(/,/g, "") + "." + cleaned.slice(i + 1);
  } else {
    cleaned = cleaned.replace(/,/g, "");
  }
  if (cleaned === "") return null;
  const pattern = digits > 0 ? new RegExp(`^\\d+(\\.\\d{0,${digits}})?$`) : /^\d+$/;
  if (!pattern.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const cents = Number(whole) * 10 ** digits + Number(frac.padEnd(digits, "0") || "0");
  return Number.isSafeInteger(cents) ? cents : null;
}
