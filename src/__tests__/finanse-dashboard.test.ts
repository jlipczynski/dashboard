import { describe, it, expect } from "vitest";
import { buildDashboard, addDays, mondayOf, type DashRow } from "@/lib/finanse-dashboard";

const cats = [
  { id: "dom", name: "Dom", type: "expense", icon: "home", color: "#E08A4F" },
  { id: "jed", name: "Jedzenie", type: "expense", icon: "cart", color: "#4FA673" },
  { id: "osz", name: "Oszczędności (przelewy własne)", type: "transfer" },
  { id: "pla", name: "Plantacja", type: "income" },
];
const subs = [
  { id: "gaz", name: "Gaz", category_id: "dom", kind: "fixed" },
  { id: "rem", name: "Naprawy i remonty", category_id: "dom", kind: "essential" },
  { id: "spo", name: "Zakupy spożywcze", category_id: "jed", kind: "essential" },
  { id: "res", name: "Restauracje i kawiarnie", category_id: "jed", kind: "discretionary" },
];
const row = (p: Partial<DashRow>): DashRow => ({
  amount: -10,
  category_id: "jed",
  subcategory_id: null,
  merchant: null,
  counterparty: null,
  description: "X",
  date: "2026-11-16",
  ...p,
});

describe("finanse-dashboard date helpers", () => {
  it("addDays crosses month boundaries", () => {
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("mondayOf returns the Monday of the week", () => {
    expect(mondayOf("2026-11-16")).toBe("2026-11-16"); // Monday
    expect(mondayOf("2026-11-22")).toBe("2026-11-16"); // Sunday
    expect(mondayOf("2026-11-15")).toBe("2026-11-09");
  });
});

describe("buildDashboard", () => {
  const rows: DashRow[] = [
    row({ amount: -300, category_id: "dom", subcategory_id: "gaz" }),
    row({ amount: -1500, category_id: "dom", subcategory_id: "rem", one_off: true }),
    row({ amount: -100, subcategory_id: "spo", reviewed_at: "2026-11-16T10:00:00Z" }),
    row({ amount: -80, subcategory_id: "res" }),
    row({ amount: 20, subcategory_id: "res" }), // refund lowers discretionary
    row({ amount: -50 }), // Jedzenie without subcategory
    row({ amount: -1200, category_id: "jed", subcategory_id: "spo" }), // big, not one-off
    row({ amount: -999, category_id: "osz" }), // transfer: never an expense
    row({ amount: 5000, category_id: "pla" }),
    row({ amount: -40, subcategory_id: "res", deleted_at: "2026-11-16T12:00:00Z" }), // trash
  ];

  const d = buildDashboard(rows, rows, cats, subs, "2026-11-16");

  it("keeps the single expense definition (total = summarizeExpenses)", () => {
    expect(d.total).toBe(300 + 1500 + 100 + 80 - 20 + 50 + 1200);
    expect(d.savingsNet).toBe(999);
    expect(d.income).toBe(5000);
  });

  it("splits by kind, unassigned when there is no subcategory", () => {
    expect(d.kinds).toEqual({ fixed: 300, essential: 1500 + 100 + 1200, discretionary: 60, unassigned: 50 });
    const sum = d.kinds.fixed + d.kinds.essential + d.kinds.discretionary + d.kinds.unassigned;
    expect(sum).toBe(d.total);
  });

  it("separates one-off spending", () => {
    expect(d.oneOff).toBe(1500);
    expect(d.recurring).toBe(d.total - 1500);
  });

  it("adds icon, colour and the subcategory breakdown", () => {
    const dom = d.categories.find((c) => c.id === "dom")!;
    expect(dom.icon).toBe("home");
    expect(dom.subcategories.map((s) => [s.name, s.amount])).toEqual([
      ["Naprawy i remonty", 1500],
      ["Gaz", 300],
    ]);
    const jed = d.categories.find((c) => c.id === "jed")!;
    expect(jed.subcategories.find((s) => s.name === "Bez podkategorii")?.amount).toBe(50);
  });

  it("counts unreviewed rows (big expenses come from the coach: bigExpensesToDiscuss)", () => {
    expect(d.unreviewedInPeriod).toBe(rows.length - 2); // one reviewed, one in the trash
  });

  it("builds the last 7 days and this week's discretionary spend", () => {
    expect(d.last7).toHaveLength(7);
    expect(d.last7[0].date).toBe("2026-11-10");
    expect(d.last7[6]).toEqual({ date: "2026-11-16", amount: 300 + 1500 + 100 + 80 - 20 + 50 + 1200 });
    expect(d.weekStart).toBe("2026-11-16");
    expect(d.weekDiscretionary).toBe(60);
  });
});
