import { describe, it, expect } from "vitest";
import { sortTransactions, defaultSortDir, type SortableTransaction } from "../lib/finanse-sort";

type T = SortableTransaction & { id: string };
const tx = (id: string, p: Partial<SortableTransaction> = {}): T => ({
  id,
  date: "2026-11-01",
  created_at: "2026-11-01T10:00:00Z",
  deleted_at: null,
  description: id,
  merchant: null,
  amount: -10,
  tag: null,
  finance_categories: null,
  ...p,
});
const ids = (l: T[]) => l.map((t) => t.id);
const cat = (name: string) => ({ name });

describe("sortTransactions", () => {
  it("date: ties broken by created_at, in both directions", () => {
    const l = [
      tx("b", { date: "2026-11-02", created_at: "2026-11-02T09:00:00Z" }),
      tx("a", { date: "2026-11-02", created_at: "2026-11-02T08:00:00Z" }),
      tx("c", { date: "2026-11-01" }),
    ];
    expect(ids(sortTransactions(l, "date", "asc"))).toEqual(["c", "a", "b"]);
    expect(ids(sortTransactions(l, "date", "desc"))).toEqual(["b", "a", "c"]);
  });

  it("amount ascending: biggest expense first; descending: reverse", () => {
    const l = [tx("small", { amount: -5 }), tx("income", { amount: 100 }), tx("big", { amount: -500 })];
    expect(ids(sortTransactions(l, "amount", "asc"))).toEqual(["big", "small", "income"]);
    expect(ids(sortTransactions(l, "amount", "desc"))).toEqual(["income", "small", "big"]);
  });

  it("category: empty always last, in both directions", () => {
    const l = [tx("none1"), tx("z", { finance_categories: cat("Zdrowie") }), tx("a", { finance_categories: cat("Auto") }), tx("none2")];
    expect(ids(sortTransactions(l, "category", "asc"))).toEqual(["a", "z", "none1", "none2"]);
    expect(ids(sortTransactions(l, "category", "desc"))).toEqual(["z", "a", "none1", "none2"]);
  });

  it("tag: empty (null or blank) always last, in both directions", () => {
    const l = [tx("blank", { tag: "  " }), tx("b", { tag: "b" }), tx("null"), tx("a", { tag: "A" })];
    expect(ids(sortTransactions(l, "tag", "asc"))).toEqual(["a", "b", "blank", "null"]);
    expect(ids(sortTransactions(l, "tag", "desc"))).toEqual(["b", "a", "blank", "null"]);
  });

  it("Polish letters: Ł after L, Ż after Z, case-insensitive", () => {
    const l = [
      tx("ż", { finance_categories: cat("Żywność") }),
      tx("z", { finance_categories: cat("zdrowie") }),
      tx("ł", { finance_categories: cat("Łódź") }),
      tx("l", { finance_categories: cat("Lidl") }),
      tx("m", { finance_categories: cat("Mieszkanie") }),
    ];
    expect(ids(sortTransactions(l, "category", "asc"))).toEqual(["l", "ł", "m", "z", "ż"]);
  });

  it("name: merchant, falling back to description; case-insensitive", () => {
    const l = [
      tx("1", { merchant: "żabka", description: "KARTA 1" }),
      tx("2", { merchant: null, description: "Allegro" }),
      tx("3", { merchant: "ZOOPLUS", description: "AAA" }),
      tx("4", { merchant: "lidl", description: "ZZZ" }),
    ];
    expect(ids(sortTransactions(l, "name", "asc"))).toEqual(["2", "4", "3", "1"]);
  });

  it("deleted: by deleted_at; does not mutate the input", () => {
    const l = [tx("old", { deleted_at: "2026-11-10T10:00:00Z" }), tx("new", { deleted_at: "2026-11-16T10:00:00Z" })];
    expect(ids(sortTransactions(l, "deleted", "desc"))).toEqual(["new", "old"]);
    expect(ids(l)).toEqual(["old", "new"]);
  });

  it("first click direction: date/deleted descending, others ascending", () => {
    expect(defaultSortDir("date")).toBe("desc");
    expect(defaultSortDir("deleted")).toBe("desc");
    for (const c of ["name", "amount", "category", "tag"] as const) expect(defaultSortDir(c)).toBe("asc");
  });
});
