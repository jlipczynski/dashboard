import type { CachedGarminData } from "./storage";

type MonthlyGoals = {
  activeCalories: { target: number; current: number };
  cycling: { target: number; current: number };
  cyclingHours: { target: number; current: number };
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
 * Calculate the "Zdrowie i Fitness" pillar score (0-100)
 * based on monthly goal completion from Garmin data.
 * Also returns per-subcategory breakdowns.
 */
export function calcHealthScore(
  goals: MonthlyGoals,
  gymMonthlyDone: number,
  gymMonthlyGoal: number
): { score: number; subcategories: SubcategoryStatus[] } {
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

  // Cycling hours
  if (goals.cyclingHours.target > 0) {
    scores.push(
      Math.min(goals.cyclingHours.current / goals.cyclingHours.target, 1) * 100
    );
    subcategories.push(subcatStatus("Rower h", "🚴", goals.cyclingHours.current, goals.cyclingHours.target, "h", pace));
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
  rozwojData?: RozwojData | null
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

  const health = calcHealthScore(
    effectiveGoals,
    effectiveGym,
    gymMonthlyGoal
  );

  const rozwoj = calcRozwojScore(rozwojData ?? null);

  return {
    zdrowie: { score: health.score, trend: getTrend(health.score), subcategories: health.subcategories },
    praca: { score: 0, trend: "steady" as const, subcategories: [] },
    rozwoj: { score: rozwoj.score, trend: rozwoj.score === 0 ? "steady" as const : getTrend(rozwoj.score), subcategories: rozwoj.subcategories },
    relacje: { score: 0, trend: "steady" as const, subcategories: [] },
  };
}
