import { describe, it, expect } from "vitest";
import { buildLesson, principleOrder, type LessonRow } from "../lib/finanse-lessons";

const categories = [
  { id: "jed", name: "Jedzenie", type: "expense" },
  { id: "zak", name: "Zakupy", type: "expense" },
  { id: "sub", name: "Subskrypcje", type: "expense" },
  { id: "osz", name: "Oszczędności (przelewy własne)", type: "transfer" },
];
const subcategories = [
  { id: "rest", kind: "discretionary" },
  { id: "ubr", kind: "discretionary" },
  { id: "media", kind: "fixed" },
];
const row = (date: string, amount: number, payee: string, category_id: string, subcategory_id: string | null, one_off = false): LessonRow => ({
  date,
  amount,
  category_id,
  subcategory_id,
  merchant: null,
  counterparty: payee,
  description: payee,
  one_off,
});
const rows = [
  row("2026-11-13", -51, "Pink Shark", "jed", "rest"),
  row("2026-11-13", -36, "Pink Shark", "jed", "rest"),
  row("2026-11-12", -2461.95, "modivo.pl", "zak", "ubr"),
  row("2026-11-16", -19.99, "APPLE.COM/BILL", "sub", "media"),
  row("2026-11-15", -1000, "JAN", "osz", null),
  row("2026-11-05", -500, "STARY", "zak", "ubr"), // older than 7 days
];
const lesson = (used: { principle: string; at: string }[] = [], r = rows) =>
  buildLesson({ rows: r, categories, subcategories, today: "2026-11-17", used });

describe("Lekcja tygodnia — a principle + one example from Jan's last 7 days", () => {
  it("first lesson: annual cost of a repeated small expense, with numbers", () => {
    const l = lesson()!;
    expect(l.principle).toBe("koszt_roczny");
    expect(l.text).toContain("Pink Shark: 2× w ostatnich 7 dniach, razem 87,00 zł");
    expect(l.text).toContain("4 524,00 zł rocznie"); // 87 × 52
    expect(l.evidence).toMatchObject({ principle: "koszt_roczny", from: "2026-11-11", to: "2026-11-17", count: 2 });
  });

  it("lessons do not repeat: the next unused principle comes next", () => {
    const l = lesson([{ principle: "koszt_roczny", at: "2026-11-10T10:00:00Z" }])!;
    expect(l.principle).toBe("koszt_alternatywny");
    expect(l.text).toContain("modivo.pl, 2 461,95 zł");
    expect(l.text).toContain("738 585,00 zł"); // 2 461,95 × 12 ÷ 4%
  });

  it("48-hour rule, subscriptions and pay-yourself-first use this week's data", () => {
    const usedAllBut = (keep: string) =>
      ["koszt_roczny", "koszt_alternatywny", "regula_48h", "subskrypcje", "najpierw_sobie"].filter((k) => k !== keep).map((k) => ({ principle: k, at: "2026-11-10T00:00:00Z" }));
    expect(lesson(usedAllBut("regula_48h"))!.text).toContain("1 zakup uznaniowy ≥ 200 zł, razem 2 461,95 zł");
    expect(lesson(usedAllBut("subskrypcje"))!.text).toContain("APPLE.COM/BILL: 19,99 zł (2026-11-16). Jako opłata miesięczna to 239,88 zł rocznie");
    expect(lesson(usedAllBut("najpierw_sobie"))!.text).toContain("odłożone (przelewy na cele i własne konta): 1 000,00 zł, wydatki uznaniowe: 2 548,95 zł");
  });

  it("when all principles were used, the one used longest ago returns", () => {
    expect(
      principleOrder([
        { principle: "koszt_roczny", at: "2026-11-03" },
        { principle: "koszt_alternatywny", at: "2026-11-10" },
        { principle: "regula_48h", at: "2026-10-27" },
        { principle: "subskrypcje", at: "2026-11-17" },
        { principle: "najpierw_sobie", at: "2026-10-20" },
      ])[0]
    ).toBe("najpierw_sobie");
  });

  it("a principle without an example this week is skipped; no data → no lesson", () => {
    const onlyApple = [row("2026-11-16", -19.99, "APPLE.COM/BILL", "sub", "media")];
    expect(lesson([], onlyApple)!.principle).toBe("subskrypcje");
    expect(lesson([], [])).toBeNull();
  });
});
