// "Wydatki wg kategorii" (home page card) — pure aggregation, no DB.
//
// Definitions (brief Finanse 04):
// - expense = transaction in a category of type "expense"; category amount = NET (-sum(amount)),
//   so refunds (positive amounts) reduce their category;
// - uncategorized negative amounts → a separate "Bez kategorii" bar, counted in the total;
// - "income" categories are never expenses: Investment net goes to savingsNet,
//   negative amounts in other income categories go to the data-quality warning;
// - rows in the trash (deleted_at set) are skipped.
// All sums are done in grosze (integers) to avoid floating-point drift.

import { extractMerchant } from "./finanse-db";
import { classifyIntermediary } from "./finanse-intermediaries";

export const INVESTMENT_CATEGORY = "Investment";
export const TOP_MERCHANTS = 5;

export type SummaryRow = {
  amount: number | string;
  category_id: string | null;
  merchant: string | null;
  counterparty: string | null;
  description: string;
  date: string; // YYYY-MM-DD
  deleted_at?: string | null;
};

export type SummaryCategoryDef = { id: string; name: string; type: string };

export type SummaryMerchant = { name: string; amount: number; count: number };
export type SummaryCategory = {
  id: string | null;
  name: string;
  amount: number;
  share: number; // % of total, 1 decimal
  count: number;
  topMerchants: SummaryMerchant[];
};

export type ExpenseSummary = {
  total: number;
  categories: SummaryCategory[];
  savingsNet: number;
  expensesInIncomeCats: { amount: number; count: number };
  monthsWithData: string[];
};

const toGr = (v: number | string) => Math.round(Number(v) * 100);
const toZl = (gr: number) => gr / 100;

/** Payee shown in "top merchants": merchant → counterparty → parsed from description, intermediary prefix stripped. */
export function payeeName(r: SummaryRow): string {
  const raw = (r.merchant && r.merchant.trim()) || (r.counterparty && r.counterparty.trim()) || extractMerchant(r.description);
  return classifyIntermediary(r.description, r.counterparty, raw).cleanMerchant.trim() || raw;
}

export function summarizeExpenses(rows: SummaryRow[], categories: SummaryCategoryDef[]): ExpenseSummary {
  const catById = new Map(categories.map((c) => [c.id, c]));
  const months = new Set<string>();
  type Acc = { id: string | null; name: string; gr: number; count: number; merchants: Map<string, { gr: number; count: number }> };
  const groups = new Map<string, Acc>();
  let savingsGr = 0;
  let incomeCatExpGr = 0;
  let incomeCatExpCount = 0;

  const add = (key: string, id: string | null, name: string, gr: number, r: SummaryRow) => {
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { id, name, gr: 0, count: 0, merchants: new Map() }));
    g.gr -= gr; // net expense = -amount
    g.count++;
    const p = payeeName(r);
    const m = g.merchants.get(p) ?? { gr: 0, count: 0 };
    m.gr -= gr;
    m.count++;
    g.merchants.set(p, m);
  };

  for (const r of rows) {
    if (r.deleted_at) continue;
    months.add(r.date.slice(0, 7));
    const gr = toGr(r.amount);
    const cat = r.category_id ? catById.get(r.category_id) : undefined;

    if (!cat) {
      if (gr < 0) add("__none__", null, "Bez kategorii", gr, r);
      continue;
    }
    if (cat.type === "expense") {
      add(cat.id, cat.id, cat.name, gr, r);
    } else if (cat.name === INVESTMENT_CATEGORY) {
      savingsGr -= gr;
    } else if (gr < 0) {
      incomeCatExpGr -= gr;
      incomeCatExpCount++;
    }
  }

  // Only categories with a positive net amount are bars (a category of pure refunds is not spending).
  const bars = [...groups.values()].filter((g) => g.gr > 0).sort((a, b) => b.gr - a.gr);
  const totalGr = bars.reduce((s, g) => s + g.gr, 0);

  return {
    total: toZl(totalGr),
    categories: bars.map((g) => ({
      id: g.id,
      name: g.name,
      amount: toZl(g.gr),
      share: totalGr > 0 ? Math.round((g.gr / totalGr) * 1000) / 10 : 0,
      count: g.count,
      topMerchants: [...g.merchants.entries()]
        .map(([name, m]) => ({ name, amount: toZl(m.gr), count: m.count }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, TOP_MERCHANTS),
    })),
    savingsNet: savingsGr > 0 ? toZl(savingsGr) : 0,
    expensesInIncomeCats: { amount: toZl(incomeCatExpGr), count: incomeCatExpCount },
    monthsWithData: [...months].sort(),
  };
}

/** Valid YYYY-MM-DD that exists in the calendar. */
export function isValidIsoDate(s: string | null): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
