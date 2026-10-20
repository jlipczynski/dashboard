import type { CachedGarminData } from "./storage";
import { healthWigScore } from "./calories";

type MonthlyGoals = {
  activeCalories: { target: number; current: number };
  cycling: { target: number; current: number };
  running: { target: number; current: number };
};

/** Per-subcategory breakdown for UI display */
export type SubcategoryStatus = {
  label: string;
  icon: string;
  current: number;
  target: number;
  unit: string;
  pct: number;
  /** "on-track" if pace >= expected for this day of month, "behind" if < 75% of expected, "warning" otherwise */
  status: "on-track" | "warning" | "behind";
  emoji: string;
};

/** Calculate expected pace fraction: dayOfMonth / daysInMonth */
function expectedPace(now: Date = new Date()): number {
  const day = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return day / daysInMonth;
}

function subcatStatus(
  label: string,
  icon: string,
  current: number,
  target: number,
  unit: string,
  pace: number
): SubcategoryStatus {
  if (target <= 0) {
    return { label, icon, current, target, unit, pct: 0, status: "on-track", emoji: "➖" };
  }
  const pct = Math.round(Math.min(current / target, 1) * 100);
  const expectedPct = pace * 100;
  let status: SubcategoryStatus["status"];
  let emoji: string;
  if (pct >= expectedPct * 0.85) {
    status = "on-track";
    emoji = "😊";
  } else if (pct >= expectedPct * 0.5) {
    status = "warning";
    emoji = "😐";
  } else {
    status = "behind";
    emoji = "😟";
  }
  return { label, icon, current, target, unit, pct, status, emoji };
}

/**
 * Rehab-mode input (null = no day counted yet):
 * monthAvg = average daily % of prescribed exercises this month,
 * caloriesScore = calorie weekly-balance score averaged over this month's weeks.
 */
export type RehabScoreInput = { monthAvg: number | null; caloriesScore?: number | null };

function rehabStatus(label: string, icon: string, monthAvg: number | null): SubcategoryStatus {
  const base = { label, icon, target: 100, unit: "%" };
  if (monthAvg === null) {
    return { ...base, current: 0, pct: 0, status: "on-track", emoji: "➖" };
  }
  const pct = Math.min(Math.max(monthAvg, 0), 100);
  if (pct >= 85) return { ...base, current: pct, pct, status: "on-track", emoji: "😊" };
  if (pct >= 50) return { ...base, current: pct, pct, status: "warning", emoji: "😐" };
  return { ...base, current: pct, pct, status: "behind", emoji: "😟" };
}

/**
 * Calculate the "Zdrowie i Fitness" pillar score (0-100)
 * based on monthly goal completion from Garmin data.
 * Also returns per-subcategory breakdowns.
 */
export function calcHealthScore(
  goals: MonthlyGoals,
  gymMonthlyDone: number,
  gymMonthlyGoal: number,
  rehab?: RehabScoreInput | null
): { score: number; subcategories: SubcategoryStatus[] } {
  // Rehab mode replaces sport goals entirely (sport goals stay stored, just not scored):
  // WIG = rehab 70% + calories 30%
  if (rehab) {
    const calories = rehab.caloriesScore ?? null;
    return {
      score: healthWigScore(rehab.monthAvg, calories) ?? 0,
      subcategories: [
        rehabStatus("Rehabilitacja", "🩺", rehab.monthAvg),
        rehabStatus("Kalorie", "🍽", calories),
      ],
    };
  }

  const scores: number[] = [];
  const pace = expectedPace();
  const subcategories: SubcategoryStatus[] = [];

  // Active calories
  if (goals.activeCalories.target > 0) {
    scores.push(
      Math.min(goals.activeCalories.current / goals.activeCalories.target, 1) * 100
    );
    subcategories.push(subcatStatus("Kalorie", "🔥", goals.activeCalories.current, goals.activeCalories.target, "kcal", pace));
  }

  // Running km
  if (goals.running.target > 0) {
    scores.push(
      Math.min(goals.running.current / goals.running.target, 1) * 100
    );
    subcategories.push(subcatStatus("Bieganie", "🏃", goals.running.current, goals.running.target, "km", pace));
  }

  // Cycling km
  if (goals.cycling.target > 0) {
    scores.push(
      Math.min(goals.cycling.current / goals.cycling.target, 1) * 100
    );
    subcategories.push(subcatStatus("Rower", "🚴", goals.cycling.current, goals.cycling.target, "km", pace));
  }

  // Gym
  if (gymMonthlyGoal > 0) {
    scores.push(Math.min(gymMonthlyDone / gymMonthlyGoal, 1) * 100);
    subcategories.push(subcatStatus("Siłownia", "🏋️", gymMonthlyDone, gymMonthlyGoal, "x", pace));
  }

  // No targets set → can't calculate score
  if (scores.length === 0) {
    return { score: 0, subcategories };
  }

  return {
    score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    subcategories,
  };
}

/**
 * Determine trend based on current score.
 */
export function getTrend(score: number): "rising" | "steady" | "needs-focus" {
  if (score >= 65) return "rising";
  if (score >= 40) return "steady";
  return "needs-focus";
}

/**
 * Rozwój data shape (matches localStorage "dashboard_rozwoj").
 */
export type RozwojArea = {
  monthlyTarget: number;
  monthlyDone: number;
};

export type RozwojData = {
  czytanie: RozwojArea;
  sluchanie: RozwojArea;
  pisanie: RozwojArea;
};

/**
 * Calculate the "Rozwój Osobisty" pillar score (0-100)
 * based on monthly goal completion across reading, listening, writing.
 * Also returns per-subcategory breakdowns.
 */
export function calcRozwojScore(data: RozwojData | null): { score: number; subcategories: SubcategoryStatus[] } {
  const subcategories: SubcategoryStatus[] = [];
  const pace = expectedPace();

  if (!data) return { score: 0, subcategories };

  const areaConfigs: { key: keyof RozwojData; label: string; icon: string; unit: string }[] = [
    { key: "czytanie", label: "Czytanie", icon: "📖", unit: "min" },
    { key: "sluchanie", label: "Słuchanie", icon: "🎧", unit: "min" },
    { key: "pisanie", label: "Pisanie", icon: "✍️", unit: "str" },
  ];

  const scores: number[] = [];

  for (const cfg of areaConfigs) {
    const a = data[cfg.key];
    if (a.monthlyTarget > 0) {
      scores.push(Math.min(a.monthlyDone / a.monthlyTarget, 1) * 100);
      subcategories.push(subcatStatus(cfg.label, cfg.icon, a.monthlyDone, a.monthlyTarget, cfg.unit, pace));
    }
  }

  if (scores.length === 0) {
    return { score: 0, subcategories };
  }

  return {
    score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    subcategories,
  };
}

/**
 * Work check-in data shape for Praca pillar scoring.
 */
export type PracaData = {
  /** Number of days this month with daily_plan = true */
  dailyPlanDays: number;
  /** Number of days elapsed this month (1..today) */
  daysElapsed: number;
  /** Number of weeks this month with weekly goals entered */
  weeksWithGoals: number;
  /** Number of weeks elapsed this month (including current partial week) */
  weeksElapsed: number;
};

/**
 * Calculate the "Praca" pillar score (0-100)
 * based on two habits:
 * 1. Plan dnia — did I make a daily plan? (% of days)
 * 2. Cele tygodniowe — did I review/enter weekly goals? (% of weeks)
 */
export function calcPracaScore(data: PracaData | null): { score: number; subcategories: SubcategoryStatus[] } {
  const pace = expectedPace();
  const subcategories: SubcategoryStatus[] = [];

  if (!data || data.daysElapsed === 0) return { score: 0, subcategories };

  const scores: number[] = [];

  // Daily plan check-in rate
  const planPct = Math.min(data.dailyPlanDays / data.daysElapsed, 1) * 100;
  scores.push(planPct);
  subcategories.push(subcatStatus("Plan dnia", "📋", data.dailyPlanDays, data.daysElapsed, "dni", pace));

  // Weekly goal review rate
  if (data.weeksElapsed > 0) {
    const weeksPct = Math.min(data.weeksWithGoals / data.weeksElapsed, 1) * 100;
    scores.push(weeksPct);
    subcategories.push(subcatStatus("Cele tygodniowe", "🎯", data.weeksWithGoals, data.weeksElapsed, "tyg", pace));
  }

  if (scores.length === 0) return { score: 0, subcategories };

  return {
    score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    subcategories,
  };
}

export type PillarScore = {
  score: number;
  trend: "rising" | "steady" | "needs-focus";
  subcategories: SubcategoryStatus[];
};

/**
 * Calculate all pillar scores.
 */
export function calcAllScores(
  garminData: CachedGarminData | null,
  goals: MonthlyGoals,
  gymMonthlyDone: number,
  gymMonthlyGoal: number,
  rozwojData?: RozwojData | null,
  pracaData?: PracaData | null,
  rehab?: RehabScoreInput | null
): Record<string, PillarScore> {
  const effectiveGoals = garminData
    ? {
        activeCalories: {
          ...goals.activeCalories,
          current: garminData.summary.month.activeCalories,
        },
        cycling: {
          ...goals.cycling,
          current: garminData.summary.month.cyclingKm,
        },
        running: {
          ...goals.running,
          current: garminData.summary.month.runningKm,
        },
      }
    : goals;

  const effectiveGym = garminData
    ? garminData.summary.month.gymSessions
    : gymMonthlyDone;

  const health = calcHealthScore(
    effectiveGoals,
    effectiveGym,
    gymMonthlyGoal,
    rehab
  );

  const rozwoj = calcRozwojScore(rozwojData ?? null);
  const praca = calcPracaScore(pracaData ?? null);

  return {
    zdrowie: { score: health.score, trend: getTrend(health.score), subcategories: health.subcategories },
    praca: { score: praca.score, trend: praca.score === 0 ? "steady" as const : getTrend(praca.score), subcategories: praca.subcategories },
    rozwoj: { score: rozwoj.score, trend: rozwoj.score === 0 ? "steady" as const : getTrend(rozwoj.score), subcategories: rozwoj.subcategories },
    relacje: { score: 0, trend: "steady" as const, subcategories: [] },
  };
}

/** Pillars that make up the overall score — each weighs the same. */
export const OVERALL_PILLARS = ["zdrowie", "rozwoj", "relacje", "praca"] as const;

/**
 * Overall score = plain average of ALL pillars (25% each).
 * A pillar without goals or progress counts as 0 — it is never skipped,
 * so one perfect pillar can't make the whole dashboard look like 100%.
 */
export function calcOverallScore(scores: Record<string, PillarScore>): {
  score: number;
  parts: { id: string; score: number; hasGoals: boolean }[];
} {
  const parts = OVERALL_PILLARS.map((id) => ({
    id,
    score: scores[id]?.score ?? 0,
    hasGoals: (scores[id]?.subcategories.length ?? 0) > 0,
  }));
  const score = Math.round(parts.reduce((s, p) => s + p.score, 0) / parts.length);
  return { score, parts };
}
