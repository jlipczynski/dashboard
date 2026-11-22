// @vitest-environment node
import { describe, it, expect } from "vitest";
import { checkinParams, CHECKIN_UPSERT_SQL } from "../lib/praca-checkin";

describe("/api/praca check-in — a missing flag is left unchanged (regression: it was overwritten with false)", () => {
  it("toggling the daily plan does not touch the weekly review", () => {
    const r = checkinParams({ date: "2026-11-22", dailyPlan: true });
    expect(r).toEqual({ ok: true, params: ["2026-11-22", true, null, null] });
  });
  it("toggling the weekly review does not touch the daily plan", () => {
    const r = checkinParams({ date: "2026-11-22", weeklyReview: false });
    expect(r).toEqual({ ok: true, params: ["2026-11-22", null, false, null] });
  });
  it("both flags and notes are passed through", () => {
    expect(checkinParams({ date: "2026-11-22", dailyPlan: false, weeklyReview: true, notes: "x" })).toEqual({
      ok: true,
      params: ["2026-11-22", false, true, "x"],
    });
  });
  it("non-boolean flags are ignored (not coerced to false)", () => {
    expect(checkinParams({ date: "2026-11-22", dailyPlan: "true", weeklyReview: 0 })).toEqual({ ok: true, params: ["2026-11-22", null, null, null] });
  });
  it("rejects a missing or malformed date", () => {
    expect(checkinParams({}).ok).toBe(false);
    expect(checkinParams({ date: "22.11.2026" }).ok).toBe(false);
  });
  it("the upsert keeps stored values for NULL parameters and defaults a new row to false", () => {
    expect(CHECKIN_UPSERT_SQL).toContain("daily_plan = COALESCE($2, work_checkins.daily_plan)");
    expect(CHECKIN_UPSERT_SQL).toContain("weekly_review = COALESCE($3, work_checkins.weekly_review)");
    expect(CHECKIN_UPSERT_SQL).toContain("VALUES ($1, COALESCE($2, false), COALESCE($3, false), COALESCE($4, ''), now())");
  });
});
