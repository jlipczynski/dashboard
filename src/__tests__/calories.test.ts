import { describe, it, expect } from "vitest";
import { calorieWeekScore, calorieRangeScore, healthWigScore } from "../lib/calories";
import { calcHealthScore } from "../lib/scores";

// Week of Mon 2026-10-19 .. Sun 2026-10-25
const WS = "2026-10-19";
const WE = "2026-10-25";

describe("calorieWeekScore", () => {
  it("null before any day counts (today empty)", () => {
    expect(calorieWeekScore([], WS, WE, WS)).toBeNull();
  });

  it("100 when under budget, surplus day offset by deficit day", () => {
    const e = [
      { date: "2026-10-19", calories: 2400 },
      { date: "2026-10-20", calories: 1600 },
    ];
    const w = calorieWeekScore(e, WS, WE, "2026-10-20")!;
    expect(w.budget).toBe(4000);
    expect(w.consumed).toBe(4000);
    expect(w.penalty).toBe(0);
    expect(w.score).toBe(100);
  });

  it("penalty 5 pts per 1% over budget", () => {
    const e = [
      { date: "2026-10-19", calories: 2200 },
      { date: "2026-10-20", calories: 2000 },
    ];
    const w = calorieWeekScore(e, WS, WE, "2026-10-20")!;
    expect(w.overKcal).toBe(200);
    expect(w.overPct).toBe(5); // 200 / 4000
    expect(w.penalty).toBe(25);
    expect(w.score).toBe(75);
  });

  it("penalty capped at 100", () => {
    const e = [{ date: "2026-10-19", calories: 3000 }];
    expect(calorieWeekScore(e, WS, WE, "2026-10-19")!.score).toBe(0);
  });

  it("missing past days scale the score down", () => {
    const e = [{ date: "2026-10-19", calories: 1800 }];
    // 19 logged, 20 missing, 21 = today empty (skipped)
    const w = calorieWeekScore(e, WS, WE, "2026-10-21")!;
    expect(w.daysElapsed).toBe(2);
    expect(w.missingDates).toEqual(["2026-10-20"]);
    expect(w.score).toBe(50);
  });

  it("all days missing = 0", () => {
    const w = calorieWeekScore([], WS, WE, "2026-10-21")!;
    expect(w.score).toBe(0);
  });
});

describe("calorieRangeScore", () => {
  it("averages week scores across weeks", () => {
    const e = [
      { date: "2026-10-25", calories: 2000 }, // week 1 (from Sun 25): 100
      { date: "2026-10-26", calories: 2200 }, // week 2: 10% over → 50
    ];
    expect(calorieRangeScore(e, "2026-10-25", "2026-10-26")).toBe(75);
  });
});

describe("healthWigScore (rehab 70% / calories 30%)", () => {
  it("weights parts", () => {
    expect(healthWigScore(90, 80)).toBe(87); // 63 + 24
  });
  it("uses the available part alone", () => {
    expect(healthWigScore(90, null)).toBe(90);
    expect(healthWigScore(null, 80)).toBe(80);
    expect(healthWigScore(null, null)).toBeNull();
  });
});

describe("calcHealthScore rehab mode with calories", () => {
  const goals = {
    activeCalories: { target: 0, current: 0 },
    cycling: { target: 0, current: 0 },
    running: { target: 0, current: 0 },
  };
  it("combines rehab and calories", () => {
    const r = calcHealthScore(goals, 0, 0, { monthAvg: 100, caloriesScore: 50 });
    expect(r.score).toBe(85);
    expect(r.subcategories.map((s) => s.label)).toEqual(["Rehabilitacja", "Kalorie"]);
  });
});
