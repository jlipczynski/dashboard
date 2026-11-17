import { describe, it, expect } from "vitest";
import { findPatterns, type PatternRow, type PlannedPurchase, type PatternInput } from "../lib/finanse-patterns";

const categories = [
  { id: "dom", name: "Dom", type: "expense" },
  { id: "sub", name: "Subskrypcje", type: "expense" },
  { id: "jed", name: "Jedzenie", type: "expense" },
  { id: "zak", name: "Zakupy", type: "expense" },
  { id: "inc", name: "Plantacja", type: "income" },
];
const subcategories = [
  { id: "sprz", name: "Sprzątanie", category_id: "dom", kind: "fixed" },
  { id: "net", name: "Internet", category_id: "dom", kind: "fixed" },
  { id: "media", name: "Media i rozrywka", category_id: "sub", kind: "fixed" },
  { id: "przek", name: "Przekąski", category_id: "jed", kind: "discretionary" },
  { id: "ubr", name: "Ubrania", category_id: "zak", kind: "discretionary" },
  { id: "spoz", name: "Spożywcze", category_id: "jed", kind: "essential" },
];
let n = 0;
const row = (date: string, amount: number, payee: string, category_id: string, subcategory_id: string | null, one_off = false): PatternRow => ({
  id: `t${++n}`,
  date,
  amount,
  category_id,
  subcategory_id,
  merchant: null,
  counterparty: payee,
  description: payee,
  one_off,
});
const run = (rows: PatternRow[], today: string, planned: PlannedPurchase[] = []) =>
  findPatterns({ rows, categories, subcategories, planned, monthlyLimit: 20000, today } satisfies PatternInput);
const ofKind = (rows: PatternRow[], today: string, kind: string, planned: PlannedPurchase[] = []) =>
  run(rows, today, planned).filter((p) => p.kind === kind);

describe("1. fixed costs per year + Liczba wolności", () => {
  const nov = [
    row("2026-11-02", -1000, "SPRZĄTANIE", "dom", "sprz"),
    row("2026-11-10", -100, "INEA", "dom", "net"),
    row("2026-11-04", -50, "NETFLIX", "sub", "media"),
    row("2026-11-05", -1200, "APPLE.COM/BILL", "sub", "media", true), // annual subscription
  ];

  it("current month so far (no full month yet): regular × 12 + one-off once; ÷ 4%", () => {
    const [p] = ofKind(nov, "2026-11-17", "fixed_costs");
    expect(p.cases).toBe(3);
    expect(p.evidence.monthly).toBe(1150);
    expect(p.evidence.yearly).toBe(15000); // 1 150 × 12 + 1 200
    expect(p.evidence.freedomNumber).toBe(375000); // 15 000 ÷ 4%
    expect(p.text).toContain("miesiąc niepełny");
    const media = p.evidence.cases.find((c) => c.payee === "Subskrypcje / Media i rozrywka")!;
    expect(media.amount).toBe(1800); // 50 × 12 + 1 200
  });

  it("uses the latest full month once there is one", () => {
    const [p] = ofKind([...nov, row("2026-12-02", -999, "SPRZĄTANIE", "dom", "sprz")], "2026-12-05", "fixed_costs");
    expect(p.evidence.period).toEqual({ from: "2026-11-01", to: "2026-11-30", partial: false });
  });

  it("recurring payee outside fixed subcategories (≥ 2 months, similar amount) counts as monthly", () => {
    const rows = [
      row("2026-12-02", -1000, "SPRZĄTANIE", "dom", "sprz"),
      row("2026-12-10", -100, "INEA", "dom", "net"),
      row("2026-11-20", -300, "TRENER", "zak", "ubr"),
      row("2026-12-20", -310, "TRENER", "zak", "ubr"),
    ];
    const [p] = ofKind(rows, "2027-01-10", "fixed_costs");
    expect(p.cases).toBe(3);
    expect(p.evidence.cases.map((c) => c.payee)).toContain("TRENER (cyklicznie)");
  });

  it("Podatek od nieruchomości is a quarterly instalment: × 4, not × 12", () => {
    const subs2 = [...subcategories, { id: "pdn", name: "Podatek od nieruchomości", category_id: "dom", kind: "fixed" }];
    const rows = [...nov, row("2026-11-05", -489.57, "US CHODZIEZ", "dom", "pdn")];
    const [p] = findPatterns({ rows, categories, subcategories: subs2, planned: [], monthlyLimit: 20000, today: "2026-11-17" }).filter((x) => x.kind === "fixed_costs");
    const tax = p.evidence.cases.find((c) => c.payee === "Dom / Podatek od nieruchomości")!;
    expect(tax.amount).toBe(1958.28);
    expect(tax.frequency).toBe("quarterly");
  });

  it("each fixed item appears once, even with several payments to the same payee", () => {
    const rows = [...nov, row("2026-11-20", -1000, "SPRZĄTANIE", "dom", "sprz")];
    const [p] = ofKind(rows, "2026-11-25", "fixed_costs");
    const names = p.evidence.cases.map((c) => c.payee);
    expect(new Set(names).size).toBe(names.length);
    expect(p.evidence.cases.find((c) => c.payee === "Dom / Sprzątanie")!.monthly).toBe(2000);
  });

  it("threshold: fewer than 3 items → no pattern", () => {
    expect(ofKind(nov.slice(0, 2), "2026-11-17", "fixed_costs")).toEqual([]);
  });
});

describe("2. month pace = monthStatus (the same forecast as the dashboard, review and coach)", () => {
  // 15.11: running spending 15 × 400 = 6 000 (→ 400/day × 15 days left = 6 000) + a 9 000 payment (not running)
  const rows = [
    ...Array.from({ length: 15 }, (_, i) => row(`2026-11-${String(i + 1).padStart(2, "0")}`, -400, `S${i}`, "jed", "spoz")),
    row("2026-11-03", -9000, "A", "dom", "sprz"),
  ];

  it("spent + running rest + planned vs the limit", () => {
    const [p] = run(rows, "2026-11-15").filter((x) => x.kind === "month_pace");
    expect(p.evidence.spent).toBe(15000);
    expect(p.evidence.runRest).toBe(6000);
    expect(p.evidence.forecast).toBe(21000);
    expect(p.evidence.difference).toBe(1000);
    expect(p.text).toContain("1 000,00 zł ponad limit");
  });

  it("not before the 10th day of the month", () => {
    expect(ofKind(rows, "2026-11-09", "month_pace")).toEqual([]);
  });
});

describe("3. discretionary frequency (≥ 5 in a month)", () => {
  const five = ["03", "05", "08", "10", "12"].map((d) => row(`2026-11-${d}`, -20, "ŻABKA", "jed", "przek"));

  it("payee and subcategory with ≥ 5 transactions: count, average, total", () => {
    const ps = ofKind(five, "2026-11-17", "frequent_discretionary");
    expect(ps.map((p) => p.text)).toEqual([
      "ŻABKA: 5 transakcji w 2026-11, średnio 20,00 zł, razem 100,00 zł.",
      "Jedzenie / Przekąski: 5 transakcji w 2026-11, średnio 20,00 zł, razem 100,00 zł.",
    ]);
    expect(ps[0].evidence.cases).toHaveLength(5);
  });

  it("4 transactions are not enough; essential spending never counts", () => {
    expect(ofKind(five.slice(0, 4), "2026-11-17", "frequent_discretionary")).toEqual([]);
    const essential = five.map((r) => ({ ...r, subcategory_id: "spoz" }));
    expect(ofKind(essential, "2026-11-17", "frequent_discretionary")).toEqual([]);
  });
});

describe("4. big purchases without a plan (48-hour rule, from 1.12.2026)", () => {
  const dec = [
    row("2026-12-03", -250, "ZALANDO", "zak", "ubr"),
    row("2026-12-08", -400, "ZARA", "zak", "ubr"),
    row("2026-12-15", -300, "H&M", "zak", "ubr"),
  ];
  const plan = (created: string, amount: number): PlannedPurchase => ({
    id: `p${created}`,
    name: "kurtka",
    amount,
    category_id: "zak",
    transaction_id: null,
    created_at: `${created}T10:00:00Z`,
  });

  it("≥ 3 discretionary purchases ≥ 200 zł without a planned entry → pattern with evidence", () => {
    const [p] = ofKind(dec, "2026-12-20", "unplanned_big");
    expect(p.cases).toBe(3);
    expect(p.total).toBe(950);
    expect(p.evidence.cases.map((c) => c.date)).toEqual(["2026-12-03", "2026-12-08", "2026-12-15"]);
  });

  it("planned ≥ 48 h before (same category, amount ±20%) is not counted → below the threshold", () => {
    expect(ofKind(dec, "2026-12-20", "unplanned_big", [plan("2026-12-05", 380)])).toEqual([]);
  });

  it("planned less than 48 h before does not count; purchases before December are ignored", () => {
    expect(ofKind(dec, "2026-12-20", "unplanned_big", [plan("2026-12-07", 400)])).toHaveLength(1);
    const nov = dec.map((r) => ({ ...r, date: r.date.replace("2026-12", "2026-11") }));
    expect(ofKind(nov, "2026-11-20", "unplanned_big")).toEqual([]);
  });
});

it("ignores the trash and data before 1 Nov 2026", () => {
  const rows = [
    ...["03", "05", "08", "10"].map((d) => row(`2026-11-${d}`, -20, "ŻABKA", "jed", "przek")),
    { ...row("2026-11-12", -20, "ŻABKA", "jed", "przek"), deleted_at: "2026-11-16T00:00:00Z" },
    row("2026-10-30", -20, "ŻABKA", "jed", "przek"),
  ];
  expect(ofKind(rows, "2026-11-17", "frequent_discretionary")).toEqual([]);
});
