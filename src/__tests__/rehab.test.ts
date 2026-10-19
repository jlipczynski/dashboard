import { describe, it, expect } from "vitest";
import {
  averagePercent,
  currentStreak,
  daysInclusive,
  rehabStats,
  weekStartStr,
  isPlanActive,
  DEFAULT_REHAB_PLAN,
} from "../lib/rehab";
import { calcHealthScore } from "../lib/scores";

const plan = DEFAULT_REHAB_PLAN;

describe("rehab date helpers", () => {
  it("plan covers 123 days (2026-10-19 .. 2027-02-18)", () => {
    expect(daysInclusive(plan.start, plan.end)).toBe(123);
  });

  it("week starts on Monday", () => {
    expect(weekStartStr("2026-10-25")).toBe("2026-10-19"); // Sunday
    expect(weekStartStr("2026-10-19")).toBe("2026-10-19"); // Monday
    expect(weekStartStr("2026-11-01")).toBe("2026-10-26"); // Sunday across month
  });

  it("plan active only within dates and when enabled", () => {
    expect(isPlanActive(plan, "2026-10-18")).toBe(false);
    expect(isPlanActive(plan, "2026-10-19")).toBe(true);
    expect(isPlanActive(plan, "2027-02-18")).toBe(true);
    expect(isPlanActive(plan, "2027-02-19")).toBe(false);
    expect(isPlanActive({ ...plan, active: false }, "2026-11-01")).toBe(false);
  });
});

describe("averagePercent", () => {
  it("skips today when no entry yet", () => {
    expect(averagePercent([], "2026-10-19", "2027-02-18", "2026-10-19")).toEqual({ avg: null, days: 0 });
  });

  it("counts today when entered", () => {
    const e = [{ date: "2026-10-19", percent: 80 }];
    expect(averagePercent(e, "2026-10-19", "2027-02-18", "2026-10-19")).toEqual({ avg: 80, days: 1 });
  });

  it("counts missing past days as 0%", () => {
    const e = [
      { date: "2026-10-19", percent: 100 },
      { date: "2026-10-21", percent: 50 },
    ];
    // 19:100, 20:0, 21:50, 22 (today, empty) skipped → 150/3 = 50
    expect(averagePercent(e, "2026-10-19", "2027-02-18", "2026-10-22")).toEqual({ avg: 50, days: 3 });
  });

  it("stops at plan end", () => {
    const e = [{ date: "2027-02-18", percent: 100 }];
    expect(averagePercent(e, "2027-02-18", "2027-02-18", "2027-03-10")).toEqual({ avg: 100, days: 1 });
  });
});

describe("currentStreak", () => {
  const e = [
    { date: "2026-10-19", percent: 100 },
    { date: "2026-10-20", percent: 100 },
    { date: "2026-10-21", percent: 100 },
  ];
  it("counts back from yesterday when today empty", () => {
    expect(currentStreak(e, 100, "2026-10-22", plan.start)).toBe(3);
  });
  it("breaks on a day below target", () => {
    const e2 = [...e, { date: "2026-10-22", percent: 90 }];
    expect(currentStreak(e2, 100, "2026-10-22", plan.start)).toBe(0);
  });
});

describe("rehabStats", () => {
  it("month average starts at plan start, not month start", () => {
    const e = [{ date: "2026-10-19", percent: 100 }];
    const s = rehabStats(plan, e, "2026-10-20"); // 19:100, 20: today empty
    expect(s.month).toBe(100);
    expect(s.dayOfPlan).toBe(2);
    expect(s.planDays).toBe(123);
  });
});

describe("calcHealthScore with rehab", () => {
  const goals = {
    activeCalories: { target: 24000, current: 0 },
    cycling: { target: 900, current: 0 },
    running: { target: 40, current: 0 },
  };

  it("ignores sport goals and uses rehab month average", () => {
    const r = calcHealthScore(goals, 0, 12, { monthAvg: 90 });
    expect(r.score).toBe(90);
    expect(r.subcategories).toHaveLength(1);
    expect(r.subcategories[0].label).toBe("Rehabilitacja");
    expect(r.subcategories[0].status).toBe("on-track");
  });

  it("scores 0 with neutral status before first day counts", () => {
    const r = calcHealthScore(goals, 0, 12, { monthAvg: null });
    expect(r.score).toBe(0);
    expect(r.subcategories[0].emoji).toBe("➖");
  });

  it("falls back to sport goals without rehab", () => {
    expect(calcHealthScore(goals, 0, 12).subcategories).toHaveLength(4);
  });
});
