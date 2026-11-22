import { describe, it, expect } from "vitest";
import {
  ratingFromRealization, realization, weekAreaResult, weekRelationResult, numericAreaWindow, relationWindow, mainScore, windowWeekStarts, formatScore,
  type LeadInstance, type ClosedWeek, type RelationRating,
} from "../lib/wig-score";
import { addDaysIso, todayWarsaw, weekStartIso } from "../lib/dates";
import { leadKeyFrom, parseLead, parseResult, planningWeekFor, weightProblems, canCloseOn, canPlanOn } from "../lib/wig-model";

const lead = (o: Partial<LeadInstance>): LeadInstance => ({ leadKey: "silownia", name: "Siłownia", unit: "treningi", direction: "at_least", target: 3, weight: 100, actual: 3, status: "manual", ...o });
const week = (ws: string, o: Partial<ClosedWeek> = {}): ClosedWeek => ({ weekStart: ws, areaExcused: {}, leads: { rozwoj: [], zdrowie: [], praca: [] }, relations: [], ...o });
const rel = (m: number | null, d: number | null, p: number | null, o: number | null): RelationRating[] => [
  { sub: "monika", rating: m, excused: false }, { sub: "dzieci", rating: d, excused: false }, { sub: "przyjaciele", rating: p, excused: false }, { sub: "pozostali", rating: o, excused: false },
];

describe("rating thresholds (no rounding before comparison)", () => {
  const cases: [number, number][] = [[49.99, 1], [50, 2], [69.99, 2], [70, 3], [84.99, 3], [85, 4], [94.99, 4], [95, 5], [110, 5], [110.01, 6], [0, 1], [150, 6]];
  for (const [p, r] of cases) it(`${p}% → ${r}`, () => expect(ratingFromRealization(p / 100)).toBe(r));
  it("float noise does not move a boundary: 7/10 = 70% → 3, 11/10 = 110% → 5, 0.95 → 5", () => {
    expect(ratingFromRealization(7 / 10)).toBe(3);
    expect(ratingFromRealization(11 / 10)).toBe(5);
    expect(ratingFromRealization(19 / 20)).toBe(5);
    expect(ratingFromRealization(0.1 + 0.6)).toBe(3); // 0.7000000000000001 is not "rounded" across, it is the same 70%
  });
});

describe("LEAD realization and the 150% cap", () => {
  it("at_least: raw value is kept (200%), the area uses at most 150%", () => {
    expect(realization(lead({ actual: 6 }))).toBe(2);
    const res = weekAreaResult([lead({ actual: 6 })]);
    expect(res.realization).toBe(1.5);
    expect(res.rating).toBe(6);
  });
  it("weighted area: 60% weight at 100% + 40% weight at 50% → 80% → 3", () => {
    const res = weekAreaResult([lead({ weight: 60, actual: 3 }), lead({ leadKey: "rehab", weight: 40, target: 6, actual: 3 })]);
    expect(res.realization).toBeCloseTo(0.8, 12);
    expect(res.rating).toBe(3);
  });
  it("calories (at_most): eating more can never improve the score; under the limit = 100%", () => {
    const limit = 14000;
    expect(realization(lead({ direction: "at_most", target: limit, actual: 12000 }))).toBe(1);
    expect(realization(lead({ direction: "at_most", target: limit, actual: 14000 }))).toBe(1);
    const over10 = realization(lead({ direction: "at_most", target: limit, actual: 15400 }))!;
    const over30 = realization(lead({ direction: "at_most", target: limit, actual: 18200 }))!;
    expect(over10).toBeCloseTo(1 / 1.1, 12);
    expect(over30).toBeLessThan(over10);
    expect(ratingFromRealization(over10)).toBe(4);
    expect(ratingFromRealization(1)).toBe(5); // a limit can give at most 5, never 6
  });
  it("range: inside = 100%, below = actual/min, above = max/actual", () => {
    expect(realization(lead({ direction: "range", target: 12000, targetMax: 14000, actual: 13000 }))).toBe(1);
    expect(realization(lead({ direction: "range", target: 12000, targetMax: 14000, actual: 6000 }))).toBe(0.5);
    expect(realization(lead({ direction: "range", target: 12000, targetMax: 14000, actual: 28000 }))).toBe(0.5);
  });
});

describe("missing data is not zero", () => {
  it("unresolved LEAD → no rating (not 1)", () => {
    const r = weekAreaResult([lead({ actual: null, status: null }), lead({ leadKey: "x", actual: 3 })]);
    expect(r.rating).toBeNull();
    expect(r.unresolved).toBe(1);
  });
  it("confirmed zero counts as 0%", () => {
    expect(weekAreaResult([lead({ actual: 0, status: "zero_confirmed" })]).rating).toBe(1);
  });
  it("excused: excluded; above half the weight excused → no data", () => {
    expect(weekAreaResult([lead({ weight: 60, actual: 3 }), lead({ leadKey: "x", weight: 40, actual: null, status: "excused" })]).rating).toBe(5);
    expect(weekAreaResult([lead({ weight: 40, actual: 3 }), lead({ leadKey: "x", weight: 60, actual: null, status: "excused" })]).rating).toBeNull();
  });
  it("relacje: missing self-rating → no value; excused Przyjaciele → weighted over the rest", () => {
    expect(weekRelationResult(rel(5, 4, null, 3)).value).toBeNull();
    const r = weekRelationResult([{ sub: "monika", rating: 5, excused: false }, { sub: "dzieci", rating: 4, excused: false }, { sub: "przyjaciele", rating: null, excused: true }, { sub: "pozostali", rating: 3, excused: false }]);
    expect(r.value).toBeCloseTo((40 * 5 + 35 * 4 + 10 * 3) / 85, 12);
  });
});

describe("4-week window, model A", () => {
  const W = ["2026-11-23", "2026-11-30", "2026-12-07", "2026-12-14"];
  it("spec example: gym 1, 4, 3, 5 of 3 → weekly 1/6/5/6, window (1+4+3+4.5)/12 = 104.2% → 5", () => {
    const weeks = [1, 4, 3, 5].map((a, i) => week(W[i], { leads: { rozwoj: [], zdrowie: [lead({ actual: a })], praca: [] } }));
    expect(weeks.map((w) => weekAreaResult(w.leads.zdrowie).rating)).toEqual([1, 6, 5, 6]);
    const win = numericAreaWindow("zdrowie", weeks);
    expect(win.realization).toBeCloseTo(12.5 / 12, 12);
    expect(win.value).toBe(5);
  });
  it("compensation only inside the same LEAD: 5 gym sessions do not cover missed Mass", () => {
    const wk = (gym: number, msza: number, ws: string) => week(ws, { leads: { rozwoj: [], zdrowie: [lead({ weight: 50, actual: gym }), lead({ leadKey: "msza", name: "Msza", unit: "razy", target: 1, weight: 50, actual: msza })], praca: [] } });
    const win = numericAreaWindow("zdrowie", [wk(6, 0, W[0]), wk(6, 0, W[1])]);
    const gym = win.leads.find((l) => l.leadKey === "silownia")!, msza = win.leads.find((l) => l.leadKey === "msza")!;
    expect(gym.realization).toBe(1.5);
    expect(msza.realization).toBe(0);
    expect(win.realization).toBeCloseTo(0.75, 12);
  });
  it("changing targets and weights: realization over Σ targets, LEADs weighted by Σ weekly weights", () => {
    const w1 = week(W[0], { leads: { rozwoj: [lead({ leadKey: "czytanie", unit: "min", target: 210, weight: 80, actual: 210 }), lead({ leadKey: "nt", unit: "rozdz", target: 5, weight: 20, actual: 0, status: "zero_confirmed" })], zdrowie: [], praca: [] } });
    const w2 = week(W[1], { leads: { rozwoj: [lead({ leadKey: "czytanie", unit: "min", target: 300, weight: 50, actual: 150 }), lead({ leadKey: "nt", unit: "rozdz", target: 5, weight: 50, actual: 10 })], zdrowie: [], praca: [] } });
    const win = numericAreaWindow("rozwoj", [w1, w2]);
    const czyt = win.leads.find((l) => l.leadKey === "czytanie")!, nt = win.leads.find((l) => l.leadKey === "nt")!;
    expect(czyt.realization).toBeCloseTo(360 / 510, 12);
    expect(nt.realization).toBeCloseTo(7.5 / 10, 12); // week 2 capped at 150% of 5
    expect(win.realization).toBeCloseTo((130 * (360 / 510) + 70 * 0.75) / 200, 12);
  });
  it("a LEAD whose unit changed: only the comparable (newest) weeks count, flagged as incomplete", () => {
    const w1 = week(W[0], { leads: { rozwoj: [lead({ leadKey: "czytanie", unit: "strony", target: 100, actual: 10 })], zdrowie: [], praca: [] } });
    const w2 = week(W[1], { leads: { rozwoj: [lead({ leadKey: "czytanie", unit: "min", target: 200, actual: 200 })], zdrowie: [], praca: [] } });
    const win = numericAreaWindow("rozwoj", [w1, w2]);
    expect(win.incomparable).toBe(true);
    expect(win.leads[0].droppedWeeks).toBe(1);
    expect(win.value).toBe(5);
  });
  it("limits (at_most) are not compensated across weeks: mean of weekly realizations", () => {
    const cal = (a: number, ws: string) => week(ws, { leads: { rozwoj: [], zdrowie: [lead({ leadKey: "kalorie", unit: "kcal", direction: "at_most", target: 14000, actual: a })], praca: [] } });
    const win = numericAreaWindow("zdrowie", [cal(10000, W[0]), cal(28000, W[1])]);
    expect(win.realization).toBeCloseTo((1 + 0.5) / 2, 12);
  });
  it("relacje window 10/20/30/40, renormalised over weeks with a value; no surplus carry-over", () => {
    const slots = [week(W[0], { relations: rel(2, 2, 2, 2) }), null, week(W[2], { relations: rel(4, 4, 4, 4) }), week(W[3], { relations: rel(6, 6, 6, 6) })];
    const r = relationWindow(slots);
    expect(r.value).toBeCloseTo((10 * 2 + 30 * 4 + 40 * 6) / 80, 12);
    expect(r.weeksWithData).toBe(3);
  });
  it("main score: weighted area values, provisional 1/4, 'brak danych' while an area has no value", () => {
    const full = week(W[3], {
      leads: { rozwoj: [lead({ leadKey: "c", actual: 3 })], zdrowie: [lead({ actual: 6 })], praca: [lead({ leadKey: "z1", target: 1, actual: 0.5 })] },
      relations: rel(5, 5, 5, 5),
    });
    const s = mainScore(W, [null, null, null, full]);
    expect(s.closedWeeks).toBe(1);
    expect(s.provisional).toBe(true);
    // rozwoj 100% → 5, zdrowie 150% → 6, praca 50% → 2, relacje 5
    expect(s.value).toBeCloseTo(0.3 * 5 + 0.3 * 6 + 0.25 * 2 + 0.15 * 5, 12);
    expect(formatScore(s.value)).toBe("4,6");
    const noRel = mainScore(W, [null, null, null, { ...full, relations: [] }]);
    expect(noRel.value).toBeNull();
    expect(noRel.missingAreas).toEqual(["relacje"]);
    expect(formatScore(noRel.value)).toBe("—");
  });
  it("window anchor: open current week is not part of the window; once closed it is", () => {
    expect(windowWeekStarts("2026-12-14", false, addDaysIso)).toEqual(["2026-11-16", "2026-11-23", "2026-11-30", "2026-12-07"]);
    expect(windowWeekStarts("2026-12-14", true, addDaysIso)).toEqual(W);
  });
});

describe("dates: Europe/Warsaw and DST", () => {
  it("Sunday 22.11 plans the week 23–29.11; Monday 23.11 plans the current week", () => {
    expect(planningWeekFor("2026-11-22")).toBe("2026-11-23");
    expect(planningWeekFor("2026-11-23")).toBe("2026-11-23");
    expect(planningWeekFor("2026-11-28")).toBe("2026-11-23");
  });
  it("UTC Sunday evening is already Monday in Warsaw (winter and summer time)", () => {
    expect(todayWarsaw(new Date("2026-11-22T23:30:00Z"))).toBe("2026-11-23");
    expect(todayWarsaw(new Date("2027-06-27T22:30:00Z"))).toBe("2027-06-28");
  });
  it("DST changes do not move week starts (25.10.2026, 28.03.2027)", () => {
    expect(todayWarsaw(new Date("2026-10-25T00:30:00Z"))).toBe("2026-10-25");
    expect(weekStartIso("2026-10-25")).toBe("2026-10-19");
    expect(addDaysIso("2026-10-19", 7)).toBe("2026-10-26");
    expect(todayWarsaw(new Date("2027-03-28T22:30:00Z"))).toBe("2027-03-29");
    expect(weekStartIso("2027-03-29")).toBe("2027-03-29");
    expect(windowWeekStarts("2027-04-05", false, addDaysIso)).toEqual(["2027-03-08", "2027-03-15", "2027-03-22", "2027-03-29"]);
  });
  it("closing from Sunday, planning until Sunday", () => {
    expect(canCloseOn("2026-11-23", "2026-11-28")).toBe(false);
    expect(canCloseOn("2026-11-23", "2026-11-29")).toBe(true);
    expect(canPlanOn("2026-11-23", "2026-11-29")).toBe(true);
    expect(canPlanOn("2026-11-16", "2026-11-23")).toBe(false);
  });
});

describe("input validation", () => {
  it("stable LEAD keys from Polish names", () => {
    expect(leadKeyFrom("Msza św.")).toBe("msza-sw");
    expect(leadKeyFrom("Nowy Testament — rozdziały")).toBe("nowy-testament-rozdzialy");
    expect(leadKeyFrom("Siłownia")).toBe("silownia");
  });
  it("weights must add to 100% per area unless the area is skipped with a reason", () => {
    expect(weightProblems([{ area: "zdrowie", weight: 60 }, { area: "zdrowie", weight: 40 }, { area: "rozwoj", weight: 100 }, { area: "praca", weight: 100 }], {})).toEqual([]);
    expect(weightProblems([{ area: "zdrowie", weight: 60 }, { area: "rozwoj", weight: 100 }], { praca: "urlop" })).toEqual(["Zdrowie: wagi sumują się do 60%, a muszą do 100%"]);
    expect(weightProblems([], {})).toHaveLength(3);
  });
  it("parseLead / parseResult", () => {
    expect(parseLead({ week: "2026-11-24", area: "zdrowie", name: "x", target: 1, weight: 100 }).ok).toBe(false);
    const ok = parseLead({ week: "2026-11-23", area: "zdrowie", name: "Kalorie", unit: "kcal", direction: "at_most", target: "14000", weight: "30" });
    expect(ok.ok && ok.lead.leadKey).toBe("kalorie");
    expect(parseLead({ week: "2026-11-23", area: "rozwoj", name: "x", source: "task", target: 1, weight: 100 }).ok).toBe(false);
    expect(parseResult({ leadId: "a", status: "excused" }).ok).toBe(false);
    const z = parseResult({ leadId: "a", status: "zero_confirmed", actual: 5 });
    expect(z.ok && z.result.actual).toBe(0);
  });
});
