// Dashboard Finansów (/finanse/dashboard) — pure aggregation on top of summarizeExpenses,
// so every "wydatki" number on the page uses the ONE definition from finanse-summary.ts.
// Adds what the scoreboard needs: category icon/colour, subcategory breakdown, split by kind
// (stałe / niezbędne / uznaniowe), one-off share, last 7 days and this week's discretionary spend.
// All sums in grosze (integers).

import { summarizeExpenses, type SummaryRow, type ExpenseSummary, type SummaryCategory } from "./finanse-summary";

export type SubKind = "fixed" | "essential" | "discretionary";

export type DashRow = SummaryRow & {
  subcategory_id?: string | null;
  one_off?: boolean | null;
  reviewed_at?: string | null;
};

export type DashCategoryDef = {
  id: string;
  name: string;
  type: string;
  icon?: string | null;
  color?: string | null;
  sort_order?: number | null;
};

export type DashSubDef = { id: string; name: string; category_id: string | null; kind?: string | null };

export type DashSubAmount = { id: string | null; name: string; kind: SubKind | null; amount: number; count: number };

export type DashCategory = SummaryCategory & {
  icon: string | null;
  color: string | null;
  subcategories: DashSubAmount[];
};

export type KindSplit = { fixed: number; essential: number; discretionary: number; unassigned: number };

export type Dashboard = Omit<ExpenseSummary, "categories"> & {
  categories: DashCategory[];
  kinds: KindSplit;
  oneOff: number;
  recurring: number;
  last7: { date: string; amount: number }[];
  weekDiscretionary: number;
  weekStart: string;
  bigCount: number;
  unreviewedInPeriod: number;
};

export const BIG_EXPENSE = 1000;

const toGr = (v: number | string) => Math.round(Number(v) * 100);
const toZl = (gr: number) => gr / 100;

const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD shifted by `days` (UTC arithmetic on a calendar date). */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Monday of the week containing isoDate. */
export function mondayOf(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  return addDays(isoDate, -dow);
}

function asKind(k: string | null | undefined): SubKind | null {
  return k === "fixed" || k === "essential" || k === "discretionary" ? k : null;
}

/**
 * @param rows   transactions of the chosen period
 * @param recent transactions of the last 14 days up to `today` (for "Ostatnie 7 dni" and the week)
 * @param today  YYYY-MM-DD in Jan's time zone
 */
export function buildDashboard(
  rows: DashRow[],
  recent: DashRow[],
  categories: DashCategoryDef[],
  subcategories: DashSubDef[],
  today: string
): Dashboard {
  const base = summarizeExpenses(rows, categories);
  const catById = new Map(categories.map((c) => [c.id, c]));
  const subById = new Map(subcategories.map((s) => [s.id, s]));
  const isExpense = (r: DashRow) => {
    const c = r.category_id ? catById.get(r.category_id) : undefined;
    return c ? c.type === "expense" : toGr(r.amount) < 0; // uncategorized outflows count as expenses
  };

  const kinds = { fixed: 0, essential: 0, discretionary: 0, unassigned: 0 };
  let oneOffGr = 0;
  let bigCount = 0;
  let unreviewed = 0;
  const subGroups = new Map<string, Map<string, { id: string | null; name: string; kind: SubKind | null; gr: number; count: number }>>();

  for (const r of rows) {
    if (r.deleted_at) continue;
    if (!r.reviewed_at) unreviewed++;
    if (!isExpense(r)) continue;
    const net = -toGr(r.amount);
    const sub = r.subcategory_id ? subById.get(r.subcategory_id) : undefined;
    const kind = asKind(sub?.kind);
    kinds[kind ?? "unassigned"] += net;
    if (r.one_off) oneOffGr += net;
    if (net >= BIG_EXPENSE * 100 && !r.one_off) bigCount++;

    const catKey = r.category_id ?? "__none__";
    let g = subGroups.get(catKey);
    if (!g) subGroups.set(catKey, (g = new Map()));
    const subKey = sub?.id ?? "__none__";
    const s = g.get(subKey) ?? { id: sub?.id ?? null, name: sub?.name ?? "Bez podkategorii", kind, gr: 0, count: 0 };
    s.gr += net;
    s.count++;
    g.set(subKey, s);
  }

  const cats: DashCategory[] = base.categories.map((c) => {
    const def = c.id ? catById.get(c.id) : undefined;
    const subs = [...(subGroups.get(c.id ?? "__none__")?.values() ?? [])]
      .filter((s) => s.gr !== 0)
      .sort((a, b) => b.gr - a.gr)
      .map((s) => ({ id: s.id, name: s.name, kind: s.kind, amount: toZl(s.gr), count: s.count }));
    return { ...c, icon: def?.icon ?? null, color: def?.color ?? null, subcategories: subs };
  });

  // Last 7 days and this week's discretionary spending
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const perDay = new Map(days.map((d) => [d, 0]));
  const weekStart = mondayOf(today);
  let weekDiscGr = 0;
  for (const r of recent) {
    if (r.deleted_at || !isExpense(r)) continue;
    const net = -toGr(r.amount);
    if (perDay.has(r.date)) perDay.set(r.date, (perDay.get(r.date) ?? 0) + net);
    const sub = r.subcategory_id ? subById.get(r.subcategory_id) : undefined;
    if (r.date >= weekStart && r.date <= today && asKind(sub?.kind) === "discretionary" && !r.one_off) weekDiscGr += net;
  }

  return {
    ...base,
    categories: cats,
    kinds: {
      fixed: toZl(kinds.fixed),
      essential: toZl(kinds.essential),
      discretionary: toZl(kinds.discretionary),
      unassigned: toZl(kinds.unassigned),
    },
    oneOff: toZl(oneOffGr),
    recurring: toZl(toGr(base.total) - oneOffGr),
    last7: days.map((d) => ({ date: d, amount: toZl(Math.max(0, perDay.get(d) ?? 0)) })),
    weekDiscretionary: toZl(weekDiscGr),
    weekStart,
    bigCount,
    unreviewedInPeriod: unreviewed,
  };
}
