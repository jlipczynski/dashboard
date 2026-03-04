import { describe, it, expect } from "vitest";
import { calcHealthScore, calcRozwojScore, getTrend } from "../lib/scores";

describe("calcHealthScore", () => {
  const emptyGoals = {
    activeCalories: { target: 0, current: 0 },
    cycling: { target: 0, current: 0 },
    cyclingHours: { target: 0, current: 0 },
    running: { target: 0, current: 0 },
  };

  it("returns 0 when no targets and no activity", () => {
    expect(calcHealthScore(emptyGoals, 0, 0)).toBe(0);
  });

  it("returns 0 when no targets even if activity exists (need goals to score)", () => {
    const goals = { ...emptyGoals, running: { target: 0, current: 23 } };
    expect(calcHealthScore(goals, 0, 0)).toBe(0);
  });

  it("returns 0 when no targets even with gym sessions (need goals to score)", () => {
    expect(calcHealthScore(emptyGoals, 3, 0)).toBe(0);
  });

  it("calculates single goal correctly", () => {
    const goals = { ...emptyGoals, running: { target: 240, current: 24 } };
    expect(calcHealthScore(goals, 0, 0)).toBe(10); // 24/240 = 10%
  });

  it("calculates multiple goals as average", () => {
    const goals = {
      activeCalories: { target: 24000, current: 12000 }, // 50%
      cycling: { target: 1200, current: 600 },           // 50%
      cyclingHours: { target: 0, current: 0 },            // skipped (no target)
      running: { target: 240, current: 240 },             // 100%
    };
    // (50 + 50 + 100) / 3 = 66.67 → 67
    expect(calcHealthScore(goals, 0, 0)).toBe(67);
  });

  it("includes gym in average when target set", () => {
    const goals = {
      activeCalories: { target: 0, current: 0 },
      cycling: { target: 0, current: 0 },
      cyclingHours: { target: 0, current: 0 },
      running: { target: 100, current: 50 }, // 50%
    };
    // running=50%, gym=8/12=66.67% → (50+66.67)/2 = 58.33 → 58
    expect(calcHealthScore(goals, 8, 12)).toBe(58);
  });

  it("caps individual goals at 100% (no bonus for exceeding)", () => {
    const goals = { ...emptyGoals, running: { target: 100, current: 200 } };
    expect(calcHealthScore(goals, 0, 0)).toBe(100);
  });

  it("handles all goals at 100%", () => {
    const goals = {
      activeCalories: { target: 24000, current: 24000 },
      cycling: { target: 1200, current: 1200 },
      cyclingHours: { target: 30, current: 30 },
      running: { target: 240, current: 240 },
    };
    expect(calcHealthScore(goals, 12, 12)).toBe(100);
  });
});

describe("calcRozwojScore", () => {
  it("returns 0 for null data", () => {
    expect(calcRozwojScore(null)).toBe(0);
  });

  it("returns 0 when no targets even with activity", () => {
    const data = {
      czytanie: { monthlyTarget: 0, monthlyDone: 60 },
      sluchanie: { monthlyTarget: 0, monthlyDone: 0 },
      pisanie: { monthlyTarget: 0, monthlyDone: 0 },
    };
    expect(calcRozwojScore(data)).toBe(0);
  });

  it("calculates average of set targets", () => {
    const data = {
      czytanie: { monthlyTarget: 300, monthlyDone: 150 },  // 50%
      sluchanie: { monthlyTarget: 600, monthlyDone: 600 },  // 100%
      pisanie: { monthlyTarget: 0, monthlyDone: 0 },        // skipped
    };
    // (50 + 100) / 2 = 75
    expect(calcRozwojScore(data)).toBe(75);
  });
});

describe("getTrend", () => {
  it("returns 'rising' for score >= 65", () => {
    expect(getTrend(65)).toBe("rising");
    expect(getTrend(100)).toBe("rising");
  });

  it("returns 'steady' for 40-64", () => {
    expect(getTrend(40)).toBe("steady");
    expect(getTrend(64)).toBe("steady");
  });

  it("returns 'needs-focus' for < 40", () => {
    expect(getTrend(0)).toBe("needs-focus");
    expect(getTrend(39)).toBe("needs-focus");
  });
});
