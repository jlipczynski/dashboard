import { describe, it, expect } from "vitest";

/**
 * Tests for PATCH semantics: only changed fields should be sent.
 */

const STATE_TO_DB: Record<string, string> = {
  goals: "goals",
  gymDays: "gym_days",
  gymWeeklyGoal: "gym_weekly_goal",
  gymMonthlyGoal: "gym_monthly_goal",
  gymMonthlyDone: "gym_monthly_done",
  runWeeklyGoal: "run_weekly_goal",
  runMonthlyGoal: "run_monthly_goal",
  bikeWeeklyGoal: "bike_weekly_goal",
  bikeMonthlyGoal: "bike_monthly_goal",
  rozwojTargets: "rozwoj_targets",
  runEntries: "run_entries",
  bikeEntries: "bike_entries",
};

type GoalsSyncState = Record<string, unknown>;

function changedKeys(prev: GoalsSyncState, next: GoalsSyncState): string[] {
  const keys: string[] = [];
  for (const k of Object.keys(STATE_TO_DB)) {
    if (JSON.stringify(prev[k]) !== JSON.stringify(next[k])) {
      keys.push(k);
    }
  }
  return keys;
}

function buildPatch(baseline: GoalsSyncState, next: GoalsSyncState): Record<string, unknown> {
  const changed = changedKeys(baseline, next);
  const patch: Record<string, unknown> = {};
  for (const k of changed) {
    patch[STATE_TO_DB[k]] = next[k];
  }
  return patch;
}

describe("changedKeys", () => {
  const baseline = {
    goals: { running: { target: 240 } },
    gymDays: [false, false, false, false, false, false, false],
    gymWeeklyGoal: 3,
    gymMonthlyGoal: 12,
    gymMonthlyDone: 1,
    runWeeklyGoal: 55,
    runMonthlyGoal: 240,
    bikeWeeklyGoal: 277,
    bikeMonthlyGoal: 1200,
    rozwojTargets: { czytanie: { monthly: 300, weekly: 75 } },
    runEntries: [0, 0, 0, 0, 0, 0, 0],
    bikeEntries: [0, 0, 0, 0, 0, 0, 0],
  };

  it("returns empty array when nothing changed", () => {
    expect(changedKeys(baseline, { ...baseline })).toEqual([]);
  });

  it("detects single scalar change", () => {
    const next = { ...baseline, gymMonthlyGoal: 15 };
    expect(changedKeys(baseline, next)).toEqual(["gymMonthlyGoal"]);
  });

  it("detects nested object change", () => {
    const next = { ...baseline, goals: { running: { target: 300 } } };
    expect(changedKeys(baseline, next)).toEqual(["goals"]);
  });

  it("detects array change", () => {
    const next = { ...baseline, gymDays: [true, false, false, false, false, false, false] };
    expect(changedKeys(baseline, next)).toEqual(["gymDays"]);
  });

  it("detects multiple changes", () => {
    const next = { ...baseline, gymMonthlyGoal: 15, runMonthlyGoal: 300 };
    const keys = changedKeys(baseline, next);
    expect(keys).toContain("gymMonthlyGoal");
    expect(keys).toContain("runMonthlyGoal");
    expect(keys).toHaveLength(2);
  });
});

describe("buildPatch", () => {
  it("only includes changed fields mapped to DB column names", () => {
    const baseline = {
      goals: { running: { target: 240 } },
      gymMonthlyGoal: 12,
      runMonthlyGoal: 240,
      bikeMonthlyGoal: 1200,
    };
    const next = { ...baseline, gymMonthlyGoal: 15 };
    const patch = buildPatch(baseline, next);

    expect(patch).toEqual({ gym_monthly_goal: 15 });
    // Does NOT include run_monthly_goal or bike_monthly_goal
    expect(patch).not.toHaveProperty("run_monthly_goal");
    expect(patch).not.toHaveProperty("bike_monthly_goal");
    expect(patch).not.toHaveProperty("goals");
  });

  it("returns empty object when nothing changed", () => {
    const state = { gymMonthlyGoal: 12 };
    expect(buildPatch(state, { ...state })).toEqual({});
  });
});
