// Brief Finanse 10 (with Jan's correction of 17.11): deterministic pattern candidates for the coach.
// NO AI, no DB, no guessing. Every candidate carries its evidence (amounts, dates, number of cases);
// a pattern needs ≥ 3 cases (the month pace is a measurement, not a pattern, so it has no such threshold).
// Deliberately NOT here: time of day / weekday (the bank gives only the date, alerts come at settlement)
// and "after a big inflow" / month-to-month trend (too little data — revisit after 3 months).
// All sums in grosze internally; output in zł.

import { payeeOf } from "./finanse-coach";
import { summarizeExpenses } from "./finanse-summary";

export const MIN_CASES = 3;
export const ANALYSIS_START = "2026-11-01"; // monitoring of finances starts here
export const SAFE_WITHDRAWAL = 0.04; // "Liczba wolności" = yearly cost ÷ 4%
export const PACE_FROM_DAY = 10; // the month pace is shown from the 10th day of the month
export const FREQUENT_MIN = 5; // discretionary payee / subcategory: ≥ 5 transactions in a month
export const BIG_UNPLANNED_ZL = 200;
export const PLAN_AHEAD_DAYS = 2; // the 48-hour rule
export const UNPLANNED_FROM = "2026-12-01"; // the 48-hour rule is measured from December

export type PatternRow = {
  id: string;
  date: string; // YYYY-MM-DD (posting date — the bank gives no time)
  amount: number | string; // signed: outflow < 0
  category_id: string | null;
  subcategory_id: string | null;
  merchant: string | null;
  counterparty: string | null;
  description: string;
  one_off?: boolean | null;
  deleted_at?: string | null;
};
export type PatternCategory = { id: string; name: string; type: string };
export type PatternSubcategory = { id: string; name: string; category_id: string | null; kind?: string | null };
export type PlannedPurchase = { id: string; name: string; amount: number | string; category_id: string | null; transaction_id: string | null; created_at: string };

export type PatternKind = "fixed_costs" | "month_pace" | "frequent_discretionary" | "unplanned_big";
export type PatternCase = { date: string; amount: number; payee?: string } & Record<string, unknown>;
export type Pattern = {
  kind: PatternKind;
  text: string; // Polish, facts only — no interpretation
  cases: number;
  total: number; // zł
  evidence: { cases: PatternCase[] } & Record<string, unknown>;
};

export type PatternInput = {
  rows: PatternRow[];
  categories: PatternCategory[];
  subcategories: PatternSubcategory[];
  planned: PlannedPurchase[];
  monthlyLimit: number; // zł (finance_goals.cost_of_living)
  today: string; // YYYY-MM-DD, Jan's time zone
};

const toGr = (v: number | string) => Math.round(Number(v) * 100);
const zl = (gr: number) => gr / 100;
/** "12 345,67 zł" — thousands always grouped (pl-PL toLocaleString leaves 4-digit numbers ungrouped). */
const fmt = (gr: number) => {
  const sign = gr < 0 ? "-" : "";
  const abs = Math.abs(gr);
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${whole},${String(abs % 100).padStart(2, "0")} zł`;
};
const dayMs = 86_400_000;
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * dayMs).toISOString().slice(0, 10);
const shortDate = (d: string) => `${Number(d.slice(8, 10))}.${d.slice(5, 7)}`;
const pad = (n: number) => String(n).padStart(2, "0");

export function monthBounds(day: string): { from: string; to: string; days: number } {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(days)}`, days };
}

type Tx = {
  id: string;
  date: string;
  gr: number;
  payee: string;
  catId: string | null;
  catName: string;
  catType: string | null;
  subId: string | null;
  subName: string | null;
  kind: string | null;
  oneOff: boolean;
};

function prepare(input: PatternInput): Tx[] {
  const catById = new Map(input.categories.map((c) => [c.id, c]));
  const subById = new Map(input.subcategories.map((s) => [s.id, s]));
  return input.rows
    .filter((r) => !r.deleted_at && r.date >= ANALYSIS_START && r.date <= input.today)
    .map((r) => {
      const c = r.category_id ? catById.get(r.category_id) : undefined;
      const s = r.subcategory_id ? subById.get(r.subcategory_id) : undefined;
      return {
        id: r.id,
        date: r.date,
        gr: toGr(r.amount),
        payee: payeeOf({ counterparty: r.counterparty, merchant: r.merchant, description: r.description ?? "" }),
        catId: c?.id ?? null,
        catName: c?.name ?? "Bez kategorii",
        catType: c?.type ?? null,
        subId: s?.id ?? null,
        subName: s?.name ?? null,
        kind: c?.type === "expense" ? (s?.kind ?? null) : null,
        oneOff: !!r.one_off,
      };
    });
}

const isDisc = (t: Tx) => t.catType === "expense" && t.kind === "discretionary";

// ── 1. Fixed costs per year + "Liczba wolności" ─────────────────────────────────────────────
// Month measured: the latest FULL month since the start; until there is one — the current month so far.
// Per fixed subcategory: regular (not one-off) net × 12 + one-off net (yearly payments, e.g. annual
// subscriptions) = yearly cost. Plus recurring payees outside fixed subcategories: payments to the same
// payee in ≥ 2 months with a similar amount (±10%) count as monthly. Liczba wolności = yearly ÷ 4%.
function fixedCosts(tx: Tx[], today: string): Pattern[] {
  const cur = monthBounds(today);
  const prevMonthDay = addDays(cur.from, -1);
  const fullPrev = prevMonthDay >= ANALYSIS_START ? monthBounds(prevMonthDay) : null;
  const period = fullPrev ?? { from: cur.from, to: today, days: cur.days };
  const partial = !fullPrev;

  type Acc = { name: string; regularGr: number; oneOffGr: number; dates: string[] };
  const groups = new Map<string, Acc>();
  for (const t of tx) {
    if (t.date < period.from || t.date > period.to || t.kind !== "fixed" || !t.subId) continue;
    const g = groups.get(t.subId) ?? { name: `${t.catName} / ${t.subName}`, regularGr: 0, oneOffGr: 0, dates: [] };
    if (t.oneOff) g.oneOffGr -= t.gr;
    else g.regularGr -= t.gr;
    g.dates.push(t.date);
    groups.set(t.subId, g);
  }
  // Recurring payees outside fixed subcategories (needs ≥ 2 months of data)
  const byPayee = new Map<string, Tx[]>();
  for (const t of tx) {
    if (t.catType !== "expense" || t.gr >= 0 || t.kind === "fixed" || t.oneOff || !t.payee) continue;
    const k = t.payee.toUpperCase();
    byPayee.set(k, [...(byPayee.get(k) ?? []), t]);
  }
  for (const list of byPayee.values()) {
    if (new Set(list.map((t) => t.date.slice(0, 7))).size < 2) continue;
    const amounts = list.map((t) => -t.gr);
    const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    if (amounts.some((a) => Math.abs(a - avg) > avg * 0.1)) continue;
    groups.set(`payee:${list[0].payee}`, { name: `${list[0].payee} (cyklicznie)`, regularGr: Math.round(avg), oneOffGr: 0, dates: list.map((t) => t.date) });
  }

  const items = [...groups.values()]
    .map((g) => {
      const monthlyGr = Math.max(0, g.regularGr);
      const yearlyGr = monthlyGr * 12 + Math.max(0, g.oneOffGr);
      return { ...g, monthlyGr, yearlyGr, dates: [...g.dates].sort() };
    })
    .filter((g) => g.yearlyGr > 0)
    .sort((a, b) => b.yearlyGr - a.yearlyGr);
  if (items.length < MIN_CASES) return [];

  const monthlyGr = items.reduce((s, g) => s + g.monthlyGr, 0);
  const yearlyGr = items.reduce((s, g) => s + g.yearlyGr, 0);
  const freedomGr = Math.round(yearlyGr / SAFE_WITHDRAWAL);
  const periodLabel = partial ? `${period.from.slice(0, 7)} do ${shortDate(period.to)}, miesiąc niepełny` : period.from.slice(0, 7);
  return [{
    kind: "fixed_costs",
    text:
      `Koszty stałe (${items.length} pozycji, wg ${periodLabel}): ${fmt(monthlyGr)} miesięcznie, ` +
      `${fmt(yearlyGr)} rocznie (z płatnościami rocznymi). Liczba wolności: ${fmt(freedomGr)}.`,
    cases: items.length,
    total: zl(yearlyGr),
    evidence: {
      cases: items.map((g) => ({
        date: g.dates[0],
        amount: zl(g.yearlyGr),
        payee: g.name,
        monthly: zl(g.monthlyGr),
        yearlyOnce: zl(Math.max(0, g.oneOffGr)),
        freedomNumber: zl(Math.round(g.yearlyGr / SAFE_WITHDRAWAL)),
        dates: g.dates,
      })),
      period: { from: period.from, to: period.to, partial },
      monthly: zl(monthlyGr),
      yearly: zl(yearlyGr),
      freedomNumber: zl(freedomGr),
      assumption: "płatności niejednorazowe w podkategoriach stałych liczone jako miesięczne; jednorazowe — jako roczne",
    },
  }];
}

// ── 2. Month pace: spent so far ÷ days elapsed × days in month vs the limit (from day 10) ───
function monthPace(input: PatternInput): Pattern[] {
  const { from, days } = monthBounds(input.today);
  const day = Number(input.today.slice(8, 10));
  if (day < PACE_FROM_DAY || from < ANALYSIS_START) return [];
  const monthRows = input.rows.filter((r) => !r.deleted_at && r.date >= from && r.date <= input.today);
  const spentGr = toGr(summarizeExpenses(monthRows, input.categories).total); // the ONE definition of expenses
  const projectedGr = Math.round((spentGr / day) * days);
  const limitGr = toGr(input.monthlyLimit);
  const diffGr = projectedGr - limitGr;
  return [{
    kind: "month_pace",
    text:
      `Tempo miesiąca: ${fmt(spentGr)} w ${day} dni → ${fmt(projectedGr)} na ${days} dni; limit ${fmt(limitGr)} — ` +
      (diffGr > 0 ? `${fmt(diffGr)} ponad limit.` : `${fmt(-diffGr)} poniżej limitu.`),
    cases: day,
    total: zl(projectedGr),
    evidence: { cases: [], month: from.slice(0, 7), spent: zl(spentGr), day, daysInMonth: days, projected: zl(projectedGr), limit: zl(limitGr), difference: zl(diffGr) },
  }];
}

// ── 3. Discretionary frequency: payee or subcategory with ≥ 5 transactions in a month ─────
function frequentDiscretionary(tx: Tx[]): Pattern[] {
  const groups = new Map<string, { label: string; month: string; list: Tx[] }>();
  for (const t of tx) {
    if (!isDisc(t) || t.gr >= 0) continue;
    const month = t.date.slice(0, 7);
    const keys: [string, string][] = [];
    if (t.payee) keys.push([`p|${month}|${t.payee.toUpperCase()}`, t.payee]);
    if (t.subId) keys.push([`s|${month}|${t.subId}`, `${t.catName} / ${t.subName}`]);
    for (const [k, label] of keys) {
      const g = groups.get(k) ?? { label, month, list: [] };
      g.list.push(t);
      groups.set(k, g);
    }
  }
  return [...groups.values()]
    .filter((g) => g.list.length >= Math.max(FREQUENT_MIN, MIN_CASES))
    .map((g) => {
      const sumGr = g.list.reduce((s, t) => s - t.gr, 0);
      const avgGr = Math.round(sumGr / g.list.length);
      return {
        kind: "frequent_discretionary" as const,
        text: `${g.label}: ${g.list.length} transakcji w ${g.month}, średnio ${fmt(avgGr)}, razem ${fmt(sumGr)}.`,
        cases: g.list.length,
        total: zl(sumGr),
        evidence: { cases: g.list.map((t) => ({ date: t.date, amount: zl(-t.gr), payee: t.payee })), month: g.month, average: zl(avgGr), label: g.label },
      };
    })
    .sort((a, b) => b.total - a.total);
}

// ── 4. Big purchases without a plan (test of the 48-hour rule, from 1.12.2026) ──────────────
// A purchase counts as planned when a planned purchase existed ≥ 48 h before it: linked by transaction_id,
// or same category and amount within ±20%. The bank date is the posting date, so the check is by day
// (planned on or before the purchase date − 2 days).
function unplannedBig(tx: Tx[], planned: PlannedPurchase[]): Pattern[] {
  const isPlanned = (t: Tx) =>
    planned.some((p) => {
      if (p.created_at.slice(0, 10) > addDays(t.date, -PLAN_AHEAD_DAYS)) return false;
      if (p.transaction_id) return p.transaction_id === t.id;
      const amt = toGr(p.amount);
      return p.category_id === t.catId && Math.abs(-t.gr - amt) <= amt * 0.2;
    });
  const list = tx
    .filter((t) => t.date >= UNPLANNED_FROM && isDisc(t) && -t.gr >= BIG_UNPLANNED_ZL * 100 && !isPlanned(t))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (list.length < MIN_CASES) return [];
  const sumGr = list.reduce((s, t) => s - t.gr, 0);
  return [{
    kind: "unplanned_big",
    text: `${list.length} wydatków uznaniowych ≥ ${fmt(BIG_UNPLANNED_ZL * 100)} bez wpisu na liście planowanych 48 h wcześniej, razem ${fmt(sumGr)}.`,
    cases: list.length,
    total: zl(sumGr),
    evidence: { cases: list.map((t) => ({ date: t.date, amount: zl(-t.gr), payee: t.payee })), threshold: BIG_UNPLANNED_ZL, from: UNPLANNED_FROM },
  }];
}

/** All pattern candidates for `today` — each with its evidence. */
export function findPatterns(input: PatternInput): Pattern[] {
  const tx = prepare(input);
  return [...fixedCosts(tx, input.today), ...monthPace(input), ...frequentDiscretionary(tx), ...unplannedBig(tx, input.planned)];
}
