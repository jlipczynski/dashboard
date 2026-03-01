import type { Task } from "./data";
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

  // If no targets set but there IS activity, show that something is happening
  if (scores.length === 0) {
    const hasActivity =
      goals.activeCalories.current > 0 ||
      goals.cycling.current > 0 ||
      goals.running.current > 0 ||
      gymMonthlyDone > 0;
    // Return a base score to indicate activity exists but targets need setting
    return hasActivity ? 10 : 0;
  }

  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

/**
 * Calculate the "Praca" pillar score (0-100)
 * based on weekly task completion.
 */
export function calcWorkScore(tasks: Task[]): number {
  const workTasks = tasks.filter((t) => t.pillar === "praca");
  if (workTasks.length === 0) return 0;

  const totalPoints = workTasks.reduce((s, t) => s + t.points, 0);
  const earnedPoints = workTasks
    .filter((t) => t.done)
    .reduce((s, t) => s + t.points, 0);

  return totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
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
 * Calculate all pillar scores.
 */
export function calcAllScores(
  garminData: CachedGarminData | null,
  goals: MonthlyGoals,
  gymMonthlyDone: number,
  gymMonthlyGoal: number,
  tasks: Task[]
) {
  // If we have garmin data, update goals' current values
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
  const workScore = calcWorkScore(tasks);

  return {
    zdrowie: { score: healthScore, trend: getTrend(healthScore) },
    praca: { score: workScore, trend: getTrend(workScore) },
    // Placeholder scores for pages not yet built
    rozwoj: { score: 0, trend: "steady" as const },
    relacje: { score: 0, trend: "steady" as const },
  };
}
