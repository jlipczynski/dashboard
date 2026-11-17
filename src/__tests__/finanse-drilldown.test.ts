import { describe, it, expect } from "vitest";
import { buildDashboard, drilldown, NONE, type DashRow } from "../lib/finanse-dashboard";
import { payeeName } from "../lib/finanse-summary";

const cats = [
  { id: "dz", name: "Dzieci", type: "expense" },
  { id: "zd", name: "Zdrowie i ja", type: "expense" },
  { id: "osz", name: "Oszczędności", type: "transfer" },
];
const subs = [
  { id: "sport", name: "Sport i zajęcia", category_id: "dz", kind: "discretionary" },
  { id: "szk", name: "Szkoła i edukacja", category_id: "dz", kind: "essential" },
  { id: "lek", name: "Lekarze i terapia", category_id: "zd", kind: "essential" },
];
let n = 0;
type R = DashRow & { id: string };
const tx = (date: string, amount: number, o: Partial<R> = {}): R => ({
  id: `t${++n}`,
  date,
  amount,
  category_id: "dz",
  subcategory_id: "sport",
  merchant: null,
  counterparty: null,
  description: "opis",
  ...o,
});

const rows: R[] = [
  tx("2026-11-12", -1840, { merchant: "Przelew na telefon", description: "Przelew na telefon", counterparty: "Szymon Trener Siłownia" }),
  tx("2026-11-04", -233, { merchant: "Przelew na telefon", description: "Przelew na telefon", counterparty: "Basen Pływalnia" }),
  tx("2026-11-12", -1000, { subcategory_id: "szk", counterparty: "kurs tenisa", description: "mateusz lipczynski" }),
  tx("2026-11-05", -760, { subcategory_id: "szk", merchant: "SZKOLA JEZYKOWA" }),
  tx("2026-11-06", -50, { subcategory_id: null, merchant: "ZABKA" }),
  tx("2026-11-07", 20, { subcategory_id: null, merchant: "ZABKA" }), // refund in the same group
  tx("2026-11-08", -99, { merchant: "SKLEP", deleted_at: "2026-11-16T00:00:00Z" }), // trash
  tx("2026-11-02", -300, { category_id: "zd", subcategory_id: "lek", merchant: "ENEL-MED" }),
  tx("2026-11-04", 1753, { category_id: "zd", subcategory_id: "lek", counterparty: "ENEL-MED", description: "ZWROT usługi medyczne" }),
  tx("2026-11-09", -500, { category_id: "osz", subcategory_id: null }), // transfer — never an expense
  tx("2026-11-10", -42, { category_id: null, subcategory_id: null, merchant: "NIEZNANY" }),
  tx("2026-11-11", 15, { category_id: null, subcategory_id: null, merchant: "NIEZNANY" }), // uncategorized inflow: not an expense
];
const dash = buildDashboard(rows, [], cats, subs, "2026-11-30");
const cat = (id: string | null) => dash.categories.find((c) => c.id === id)!;

describe("drill-down: the list adds up to the row's amount", () => {
  it("(a) category", () => {
    const d = drilldown(rows, cats, subs, { categoryId: "dz" });
    expect(d.total).toBe(cat("dz").amount);
    expect(d.rows).toHaveLength(6); // trash skipped
    expect(d.rows.map((r) => r.date)).toEqual([...d.rows.map((r) => r.date)].sort().reverse()); // newest first
  });

  it("(b) every subcategory, incl. 'Bez podkategorii' with a refund", () => {
    for (const s of cat("dz").subcategories) {
      const d = drilldown(rows, cats, subs, { categoryId: "dz", subcategoryId: s.id ?? NONE });
      expect(d.total).toBe(s.amount);
      expect(d.rows).toHaveLength(s.count);
    }
    expect(drilldown(rows, cats, subs, { categoryId: "dz", subcategoryId: NONE }).total).toBe(30); // 50 − 20
  });

  it("(c) every payee in 'Najwięcej u'", () => {
    for (const m of cat("dz").topMerchants) {
      const d = drilldown(rows, cats, subs, { categoryId: "dz", payee: m.name });
      expect(d.total).toBe(m.amount);
      expect(d.rows).toHaveLength(m.count);
    }
  });

  it("(d) category where the refund exceeds spending (net negative)", () => {
    const neg = dash.netNegativeCategories.find((c) => c.id === "zd")!;
    const d = drilldown(rows, cats, subs, { categoryId: "zd" });
    expect(d.total).toBe(-1453); // 300 − 1 753
    expect(d.total).toBe(-neg.amount);
    expect(d.rows.some((r) => Number(r.amount) > 0)).toBe(true);
  });

  it("'Bez kategorii': only outflows, like the tile", () => {
    const d = drilldown(rows, cats, subs, { categoryId: NONE });
    expect(d.total).toBe(cat(null).amount);
    expect(d.rows).toHaveLength(1);
  });

  it("a transfer category is never listed as an expense", () => {
    expect(drilldown(rows, cats, subs, { categoryId: "osz" }).rows).toEqual([]);
  });
});

describe("payeeName: BLIK phone transfers use the recipient", () => {
  it("'Przelew na telefon' with a recipient → the recipient", () => {
    expect(payeeName({ merchant: "Przelew na telefon", description: "Przelew na telefon", counterparty: "Szymon Trener Siłownia", amount: -1, category_id: null, date: "2026-11-01" })).toBe(
      "Szymon Trener Siłownia"
    );
  });
  it("without a recipient it stays 'Przelew na telefon'; other payments unchanged", () => {
    expect(payeeName({ merchant: "Przelew na telefon", description: "Przelew na telefon", counterparty: null, amount: -1, category_id: null, date: "2026-11-01" })).toBe(
      "Przelew na telefon"
    );
    expect(payeeName({ merchant: "ZABKA Z123", description: "PŁATNOŚĆ KARTĄ", counterparty: "ŻABKA POLSKA", amount: -1, category_id: null, date: "2026-11-01" })).toBe("ZABKA Z123");
  });
  it("'Najwięcej u' no longer merges different phone-transfer recipients", () => {
    const names = cat("dz").topMerchants.map((m) => m.name);
    expect(names).toContain("Szymon Trener Siłownia");
    expect(names).toContain("Basen Pływalnia");
    expect(names).not.toContain("Przelew na telefon");
  });
});
