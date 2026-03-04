import { describe, it, expect, vi } from "vitest";

/**
 * Tests for the goals persistence architecture.
 * These validate the critical invariant: user data must never be
 * overwritten by default/zero values due to race conditions.
 */

// Mock the goals API POST handler logic
function buildGoalsRow(body: Record<string, unknown>) {
  return {
    id: "default",
    goals: body.goals ?? {},
    gym_days: body.gym_days ?? [false, false, false, false, false, false, false],
    gym_weekly_goal: body.gym_weekly_goal ?? 0,
    gym_monthly_goal: body.gym_monthly_goal ?? 0,
    gym_monthly_done: body.gym_monthly_done ?? 0,
    run_weekly_goal: body.run_weekly_goal ?? 0,
    run_monthly_goal: body.run_monthly_goal ?? 0,
    bike_weekly_goal: body.bike_weekly_goal ?? 0,
    bike_monthly_goal: body.bike_monthly_goal ?? 0,
    rozwoj_targets: body.rozwoj_targets ?? {},
    run_entries: body.run_entries ?? [0, 0, 0, 0, 0, 0, 0],
    bike_entries: body.bike_entries ?? [0, 0, 0, 0, 0, 0, 0],
  };
}

describe("Goals API POST (upsert)", () => {
  it("preserves all fields when saving complete state", () => {
    const body = {
      goals: {
        activeCalories: { target: 24000, current: 3882, unit: "kcal" },
        cycling: { target: 1200, current: 79.5, unit: "km" },
        cyclingHours: { target: 30, current: 2.6, unit: "h" },
        running: { target: 240, current: 23.07, unit: "km" },
        competition: { name: "Maraton", date: "2026-05-01", type: "running", distance: 42 },
        competitions: [],
      },
      gym_monthly_goal: 12,
      gym_monthly_done: 1,
      run_monthly_goal: 240,
      bike_monthly_goal: 1200,
    };

    const row = buildGoalsRow(body);
    expect((row.goals as Record<string, unknown> & { running: { target: number } }).running.target).toBe(240);
    expect(row.run_monthly_goal).toBe(240);
    expect(row.gym_monthly_goal).toBe(12);
  });

  it("PROBLEM: sending defaults overwrites real data", () => {
    // This test documents the bug: if we send default state
    // (all zeros), it wipes out real data in Supabase
    const defaultBody = {
      goals: {
        activeCalories: { target: 0, current: 0, unit: "kcal" },
        cycling: { target: 0, current: 0, unit: "km" },
        cyclingHours: { target: 0, current: 0, unit: "h" },
        running: { target: 0, current: 0, unit: "km" },
        competition: { name: "", date: "", type: "running", distance: 0 },
        competitions: [],
      },
      gym_monthly_goal: 0,
      run_monthly_goal: 0,
      bike_monthly_goal: 0,
    };

    const row = buildGoalsRow(defaultBody);
    // All zeros — this would destroy user's real goals if sent to DB
    expect(row.run_monthly_goal).toBe(0);
    expect((row.goals as Record<string, unknown> & { running: { target: number } }).running.target).toBe(0);
  });
});

describe("PATCH vs full replacement semantics", () => {
  it("partial update preserves unrelated fields", () => {
    const existing = {
      goals: { running: { target: 240 }, cycling: { target: 1200 } },
      run_monthly_goal: 240,
      bike_monthly_goal: 1200,
      gym_monthly_goal: 12,
    };

    // User only changes gym goal
    const patch = { gym_monthly_goal: 15 };
    const merged = { ...existing, ...patch };

    expect(merged.run_monthly_goal).toBe(240); // preserved
    expect(merged.bike_monthly_goal).toBe(1200); // preserved
    expect(merged.gym_monthly_goal).toBe(15); // updated
  });
});

describe("Loading gate prevents premature saves", () => {
  it("should not persist before initial load completes", () => {
    let loaded = false;
    const saveFn = vi.fn();

    // Simulate setState before load
    const setState = (next: unknown) => {
      if (loaded) {
        saveFn(next);
      }
    };

    setState({ runMonthlyGoal: 0 }); // called before load
    expect(saveFn).not.toHaveBeenCalled();

    loaded = true;
    setState({ runMonthlyGoal: 240 }); // called after load
    expect(saveFn).toHaveBeenCalledWith({ runMonthlyGoal: 240 });
  });
});
