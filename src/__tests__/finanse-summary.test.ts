// @vitest-environment node
import { describe, it, expect } from "vitest";
import { summarizeExpenses, isValidIsoDate, payeeName, type SummaryRow } from "../lib/finanse-summary";

const cats = [
  { id: "food", name: "Food & Drink", type: "expense" },
  { id: "shop", name: "Shopping", type: "expense" },
  { id: "inv", name: "Investment", type: "income" },
  { id: "mal", name: "Maliny", type: "income" },
];
const row = (p: Partial<SummaryRow>): SummaryRow => ({
  amount: -10,
  category_id: "food",
  merchant: null,
  counterparty: null,
  description: "X",
  date: "2026-11-05",
  ...p,
});

describe("summarizeExpenses", () => {
  it("a refund reduces its category (net)", () => {
    const s = summarizeExpenses(
      [row({ amount: -100, category_id: "shop" }), row({ amount: 30, category_id: "shop" })],
      cats
    );
    expect(s.categories).toHaveLength(1);
    expect(s.categories[0]).toMatchObject({ name: "Shopping", amount: 70, count: 2, share: 100 });
    expect(s.total).toBe(70);
  });

  it("Investment is not on the chart — goes to savingsNet (0 when not positive)", () => {
    const s = summarizeExpenses([row({ amount: -500, category_id: "inv" }), row({ amount: 100, category_id: "inv" })], cats);
    expect(s.categories).toEqual([]);
    expect(s.total).toBe(0);
    expect(s.savingsNet).toBe(400);
    expect(summarizeExpenses([row({ amount: 50, category_id: "inv" })], cats).savingsNet).toBe(0);
  });

  it("negative amounts in other income categories → warning, not the chart; positives ignored", () => {
    const s = summarizeExpenses(
      [row({ amount: -1000, category_id: "mal" }), row({ amount: -661, category_id: "mal" }), row({ amount: 5000, category_id: "mal" })],
      cats
    );
    expect(s.categories).toEqual([]);
    expect(s.expensesInIncomeCats).toEqual({ amount: 1661, count: 2 });
  });

  it("rows in the trash are skipped entirely", () => {
    const s = summarizeExpenses(
      [row({ amount: -10 }), row({ amount: -99, deleted_at: "2026-11-16T10:00:00Z", date: "2026-04-01" })],
      cats
    );
    expect(s.total).toBe(10);
    expect(s.monthsWithData).toEqual(["2026-11"]);
  });

  it("uncategorized negatives form a separate bar counted in the total", () => {
    const s = summarizeExpenses(
      [row({ amount: -40, category_id: null }), row({ amount: 25, category_id: null }), row({ amount: -60 })],
      cats
    );
    expect(s.categories.map((c) => [c.id, c.name, c.amount])).toEqual([
      ["food", "Food & Drink", 60],
      [null, "Bez kategorii", 40],
    ]);
    expect(s.total).toBe(100);
    expect(s.categories.map((c) => c.share)).toEqual([60, 40]);
  });

  it("sums in grosze — no floating-point drift", () => {
    const s = summarizeExpenses([row({ amount: "-0.10" }), row({ amount: "-0.20" }), row({ amount: -0.3 })], cats);
    expect(s.total).toBe(0.6);
  });

  it("top merchants: merchant → counterparty → description, intermediary prefix stripped, top 5 by amount", () => {
    const rows = [
      row({ amount: -50, merchant: "PAYPAL *ZOOPLUS SE 4029357733" }),
      row({ amount: -30, merchant: "ZOOPLUS SE" }),
      row({ amount: -100, counterparty: "Biedronka" }),
      row({ amount: -1, description: "DOP. MC 000000******0000 PŁATNOŚĆ KARTĄ 1.00 PLN LIDL POZNAN" }),
      ...["A", "B", "C", "D"].map((m, i) => row({ amount: -(i + 2), merchant: m })),
    ];
    const top = summarizeExpenses(rows, cats).categories[0].topMerchants;
    expect(top).toHaveLength(5);
    expect(top[0]).toEqual({ name: "Biedronka", amount: 100, count: 1 });
    expect(top[1]).toEqual({ name: "ZOOPLUS SE", amount: 80, count: 2 });
    expect(payeeName(rows[3])).toBe("LIDL POZNAN");
  });

  it("categories sorted descending; monthsWithData sorted and unique", () => {
    const s = summarizeExpenses(
      [row({ amount: -5, date: "2026-11-01" }), row({ amount: -50, category_id: "shop", date: "2026-04-03" }), row({ amount: -1, date: "2026-04-20" })],
      cats
    );
    expect(s.categories.map((c) => c.name)).toEqual(["Shopping", "Food & Drink"]);
    expect(s.monthsWithData).toEqual(["2026-04", "2026-11"]);
  });
});

describe("helpers", () => {
  it("isValidIsoDate", () => {
    expect(isValidIsoDate("2026-11-30")).toBe(true);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("2026-1-5")).toBe(false);
    expect(isValidIsoDate(null)).toBe(false);
  });
});
