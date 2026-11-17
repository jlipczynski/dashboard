import { describe, it, expect } from "vitest";
import {
  monthStatus,
  bigExpensesToDiscuss,
  monthBounds,
  weekStartOf,
  validateDecision,
  buildCoachPrompt,
  payeeOf,
  validateGoalPatch,
  type CoachRow,
} from "../lib/finanse-coach";

const cats = [
  { id: "dom", name: "Dom", type: "expense" },
  { id: "zak", name: "Zakupy", type: "expense" },
  { id: "osz", name: "Oszczędności (przelewy własne)", type: "transfer" },
  { id: "pla", name: "Plantacja", type: "income" },
];
let n = 0;
const row = (p: Partial<CoachRow>): CoachRow => ({
  id: `t${++n}`,
  amount: -100,
  category_id: "dom",
  merchant: null,
  counterparty: null,
  description: "X",
  date: "2026-11-10",
  one_off: false,
  ...p,
});
const goal = { monthly_limit: 20000, counts: "all" as const };

const subs = [
  { id: "media", kind: "fixed" },
  { id: "jedz", kind: "essential" },
];

describe("monthStatus — forecast = spent + running rest of the month + planned (brief 12.1)", () => {
  it("November example (17.11): run rate 13 074,61 / 17 days → +9 998,23 → forecast 35 421,74", () => {
    // 13 × 999,00 + 87,61 = 13 074,61 of running spending; a 12 348,90 payment (≥ 1 000) only in "spent"
    const rows = [...Array.from({ length: 13 }, () => row({ amount: -999 })), row({ amount: -87.61 }), row({ amount: -12348.9 })];
    const s = monthStatus(rows, cats, subs, 0, goal, "2026-11-17");
    expect(s.spent).toBe(25423.51);
    expect(s.runRateBase).toBe(13074.61);
    expect(s.dailyRate).toBe(769.09);
    expect(s.dayOfMonth).toBe(17);
    expect(s.daysLeft).toBe(13);
    expect(s.runRest).toBe(9998.23);
    expect(s.forecast).toBe(35421.74);
    expect(s.overBy).toBe(15421.74);
    expect(s.preliminary).toBe(false);
  });

  it("a −1 200 zł expense is not running spending", () => {
    expect(monthStatus([row({ amount: -1200 })], cats, subs, 0, goal, "2026-11-10").runRateBase).toBe(0);
    expect(monthStatus([row({ amount: -999.99 })], cats, subs, 0, goal, "2026-11-10").runRateBase).toBe(999.99);
  });

  it("one-off, fixed-kind and refunds are not running spending; transfers/income ignored", () => {
    const rows = [
      row({ amount: -100, one_off: true }),
      row({ amount: -200, subcategory_id: "media" }),
      row({ amount: 50 }),
      row({ amount: -300, category_id: "osz" }),
      row({ amount: 400, category_id: "pla" }),
      row({ amount: -10, subcategory_id: "jedz" }),
    ];
    const s = monthStatus(rows, cats, subs, 0, goal, "2026-11-10");
    expect(s.runRateBase).toBe(10);
    expect(s.spent).toBe(260); // 100 + 200 − 50 + 10
  });

  it("last day of the month: daysLeft = 0 and forecast = spent + planned", () => {
    const s = monthStatus([row({ amount: -500 })], cats, subs, 1500, goal, "2026-11-30");
    expect(s.daysLeft).toBe(0);
    expect(s.runRest).toBe(0);
    expect(s.forecast).toBe(2000);
    expect(s.perDayLeft).toBe(0);
  });

  it("before the 5th day the forecast is preliminary", () => {
    expect(monthStatus([row({ amount: -50, date: "2026-11-02" })], cats, subs, 0, goal, "2026-11-04").preliminary).toBe(true);
  });

  it("under the limit: per-day budget for the days left", () => {
    const s = monthStatus([row({ amount: -10000 })], cats, subs, 0, goal, "2026-11-21");
    expect(s.left).toBe(10000);
    expect(s.daysLeft).toBe(9);
    expect(s.perDayLeft).toBe(1111.11);
  });

  it("goal counting only recurring spend ignores one-offs", () => {
    const s = monthStatus([row({ amount: -15000 }), row({ amount: -8000, one_off: true })], cats, subs, 0, { monthly_limit: 20000, counts: "recurring" }, "2026-11-30");
    expect(s.spent).toBe(23000);
    expect(s.forecast).toBe(15000);
    expect(s.left).toBe(5000);
  });
});

describe("bigExpensesToDiscuss", () => {
  it("≥ 1000 zł single expenses without a decision, biggest first; transfers and income skipped", () => {
    const a = row({ amount: -2461.95, category_id: "zak", merchant: "modivo.pl Zielona Gora" });
    const b = row({ amount: -1000, counterparty: "kurs tenisa" });
    const decided = row({ amount: -2000 });
    const rows = [b, row({ amount: -999.99 }), a, decided, row({ amount: -5000, category_id: "osz" }), row({ amount: 3000, category_id: "pla" })];
    const list = bigExpensesToDiscuss(rows, cats, new Set([decided.id]));
    expect(list.map((x) => [x.amount, x.payee, x.categoryName])).toEqual([
      [2461.95, "modivo.pl Zielona Gora", "Zakupy"],
      [1000, "kurs tenisa", "Dom"],
    ]);
  });
});

describe("validateGoalPatch", () => {
  it("amount with Polish formatting; status pending/approved", () => {
    expect(validateGoalPatch({ monthlyLimit: "18 500,5" })).toEqual({ ok: true, value: { monthly_limit: "18500.50" } });
    expect(validateGoalPatch({ status: "approved" })).toEqual({ ok: true, value: { status: "approved" } });
  });
  it("rejects zero/negative/garbage, unknown status, empty patch", () => {
    expect(validateGoalPatch({ monthlyLimit: "0" }).ok).toBe(false);
    expect(validateGoalPatch({ monthlyLimit: "abc" }).ok).toBe(false);
    expect(validateGoalPatch({ status: "final" }).ok).toBe(false);
    expect(validateGoalPatch({}).ok).toBe(false);
  });
});

describe("payeeOf", () => {
  it("card payment without payee → shop name, no masked card number", () => {
    expect(
      payeeOf({ counterparty: null, merchant: null, description: "DOP. MC 000000******0000 PŁATNOŚĆ KARTĄ 1200.06 PLN GOOGLE WORKSPACE WARSAW" })
    ).toBe("GOOGLE WORKSPACE WARSAW");
    expect(payeeOf({ counterparty: null, merchant: null, description: "DOP. MC 000000******0000 PŁATNOŚĆ KARTĄ 264.00 EUR SHOP X" })).toBe("SHOP X");
  });
  it("counterparty first; masked numbers removed from any fallback", () => {
    expect(payeeOf({ counterparty: "kurs tenisa", merchant: "x", description: "y" })).toBe("kurs tenisa");
    expect(payeeOf({ counterparty: null, merchant: null, description: "Opłata 000000******0000 za kartę" })).toBe("Opłata za kartę");
  });
});

describe("dates", () => {
  it("monthBounds handles month length", () => {
    expect(monthBounds("2026-11-17")).toEqual({ from: "2026-11-01", to: "2026-11-30", days: 30 });
    expect(monthBounds("2028-02-10").to).toBe("2028-02-29");
  });
  it("weekStartOf returns Monday", () => {
    expect(weekStartOf("2026-11-17")).toBe("2026-11-16");
    expect(weekStartOf("2026-11-22")).toBe("2026-11-16");
    expect(weekStartOf("2026-11-16")).toBe("2026-11-16");
  });
});

describe("validateDecision", () => {
  it("recurring expense needs a date and a plan", () => {
    expect(validateDecision({ transactionId: "t", necessary: "partly", recurring: true }).ok).toBe(false);
    expect(validateDecision({ transactionId: "t", necessary: "partly", recurring: true, horizonUntil: "2027-06-30" }).ok).toBe(false);
    expect(
      validateDecision({ transactionId: "t", necessary: "partly", recurring: true, horizonUntil: "2027-06-30", plan: " tańszy trener " })
    ).toEqual({ ok: true, value: { transaction_id: "t", necessary: "partly", recurring: true, horizon_until: "2027-06-30", plan: "tańszy trener" } });
  });
  it("one-time expense: no date needed; bad answers rejected", () => {
    expect(validateDecision({ transactionId: "t", necessary: "no", recurring: false })).toEqual({
      ok: true,
      value: { transaction_id: "t", necessary: "no", recurring: false, horizon_until: null, plan: null },
    });
    expect(validateDecision({ transactionId: "t", necessary: "maybe", recurring: false }).ok).toBe(false);
    expect(validateDecision({ necessary: "no", recurring: false }).ok).toBe(false);
  });
});

describe("buildCoachPrompt", () => {
  const status = monthStatus([row({ amount: -26999 })], cats, subs, 0, goal, "2026-11-17");
  const big = { id: "x", date: "2026-11-12", amount: 2461.95, payee: "modivo.pl Zielona Gora", categoryId: "zak", categoryName: "Zakupy" };
  it("step 2: payee, amount, category, date; an APPROVED limit is reported as an overrun", () => {
    const p = buildCoachPrompt(2, { today: "2026-11-17", status, big, limitApproved: true });
    expect(p).toContain("modivo.pl Zielona Gora");
    expect(p).toContain("2461,95 zł");
    expect(p).toContain("Limit (zatwierdzony)");
    expect(p).toContain("PRZEKROCZENIE o 6999,00 zł (prognoza, nie wynik końcowy)");
    expect(p).toContain("Bieżące wydatki do końca miesiąca");
  });
  it("a PENDING limit is a working proposal: no 'PRZEKROCZENIE', marked as not approved", () => {
    const p = buildCoachPrompt(2, { today: "2026-11-17", status, big });
    expect(p).toContain("Limit ROBOCZY, niezatwierdzony przez Jana");
    expect(p).toContain("6999,00 zł powyżej limitu roboczego");
    expect(p).not.toContain("PRZEKROCZENIE");
  });
  it("masks an account number that slipped into a text; includes Jan's answer", () => {
    const p = buildCoachPrompt(
      5,
      { today: "2026-11-17", status, lastCommitment: "przelew na 00 0000 0000 0000 0000 0000 1234" },
      "tak, dotrzymałem"
    );
    expect(p).not.toMatch(/0000 0000/);
    expect(p).toContain("Odpowiedź Jana: „tak, dotrzymałem”");
  });
});
