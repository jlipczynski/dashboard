import type { CachedGarminData } from "./storage";

type MonthlyGoals = {
  activeCalories: { target: number; current: number };
  cycling: { target: number; current: number };
  cyclingHours: { target: number; current: number };
  running: { target: number; current: number };
};

/**
 * Calculate the "Zdrowie i Fitness" pillar score (0-100)
 * based on monthly goal completion from Garmin data.
 */
export function calcHealthScore(
  goals: MonthlyGoals,
  gymMonthlyDone: number,
  gymMonthlyGoal: number
): number {
  const scores: number[] = [];

  // Active calories
  if (goals.activeCalories.target > 0) {
    scores.push(
      Math.min(goals.activeCalories.current / goals.activeCalories.target, 1) * 100
    );
  }

  // Cycling km
  if (goals.cycling.target > 0) {
    scores.push(
      Math.min(goals.cycling.current / goals.cycling.target, 1) * 100
    );
  }

  // Cycling hours
  if (goals.cyclingHours.target > 0) {
    scores.push(
      Math.min(goals.cyclingHours.current / goals.cyclingHours.target, 1) * 100
    );
  }

  // Running km
  if (goals.running.target > 0) {
    scores.push(
      Math.min(goals.running.current / goals.running.target, 1) * 100
    );
  }

  // Gym
  if (gymMonthlyGoal > 0) {
    scores.push(Math.min(gymMonthlyDone / gymMonthlyGoal, 1) * 100);
  }

  // No targets set → can't calculate score
  if (scores.length === 0) {
    return 0;
  }

  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
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
 */
export function calcRozwojScore(data: RozwojData | null): number {
  if (!data) return 0;
  const areas = [data.czytanie, data.sluchanie, data.pisanie];
  const scores: number[] = [];

  for (const a of areas) {
    if (a.monthlyTarget > 0) {
      scores.push(Math.min(a.monthlyDone / a.monthlyTarget, 1) * 100);
    }
  }

  if (scores.length === 0) {
    return 0;
  }

  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

/**
 * Calculate all pillar scores.
 */
export function calcAllScores(
  garminData: CachedGarminData | null,
  goals: MonthlyGoals,
  gymMonthlyDone: number,
  gymMonthlyGoal: number,
  rozwojData?: RozwojData | null
) {
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
        cyclingHours: {
          ...goals.cyclingHours,
          current: garminData.summary.month.cyclingHours,
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

  const healthScore = calcHealthScore(
    effectiveGoals,
    effectiveGym,
    gymMonthlyGoal
  );

  const rozwojScore = calcRozwojScore(rozwojData ?? null);

  return {
    zdrowie: { score: healthScore, trend: getTrend(healthScore) },
    praca: { score: 0, trend: "steady" as const },
    rozwoj: { score: rozwojScore, trend: rozwojScore === 0 ? "steady" as const : getTrend(rozwojScore) },
    relacje: { score: 0, trend: "steady" as const },
  };
}
