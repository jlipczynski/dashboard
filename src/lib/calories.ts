// Calorie WIG: daily limit, scored on the weekly balance (4DX lag measure).
// Lead measure = logging what you ate every day.

import { addDays, weekStartStr } from "./rehab";

export const CALORIE_DAILY_LIMIT = 2000;
/** Score points lost per 1% over the weekly budget. */
export const CALORIE_PENALTY_PER_PCT = 5;

/** Health pillar WIG weights while the rehab plan is active. */
export const HEALTH_WEIGHTS = { rehab: 0.7, calories: 0.3 };

export type CalorieEntry = { date: string; calories: number };

export type CalorieWeekScore = {
  from: string;
  to: string;
  daysElapsed: number;
  daysLogged: number;
  missingDates: string[];
  consumed: number;
  budget: number; // limit × logged days
  overKcal: number; // > 0 when over budget
  overPct: number; // % over budget, rounded to 0.1
  penalty: number; // points lost for exceeding the budget
  balanceScore: number; // 100 - penalty
  loggingFactor: number; // daysLogged / daysElapsed
  score: number; // balanceScore × loggingFactor
};

/**
 * Score one week (or part of it) from..to, capped at today.
 * Today counts only once logged (the day isn't over yet).
 * Returns null when no day counts yet.
 */
export function calorieWeekScore(
  entries: CalorieEntry[],
  from: string,
  to: string,
  today: string,
  limit: number = CALORIE_DAILY_LIMIT
): CalorieWeekScore | null {
  const byDate = new Map(entries.map((e) => [e.date, e.calories]));
  const last = to < today ? to : today;
  let daysElapsed = 0;
  let daysLogged = 0;
  let consumed = 0;
  const missingDates: string[] = [];
  for (let d = from; d <= last; d = addDays(d, 1)) {
    const kcal = byDate.get(d);
    if (kcal === undefined) {
      if (d === today) continue;
      missingDates.push(d);
      daysElapsed++;
      continue;
    }
    daysElapsed++;
    daysLogged++;
    consumed += kcal;
  }
  if (daysElapsed === 0) return null;

  const budget = limit * daysLogged;
  const overKcal = Math.max(consumed - budget, 0);
  const overPct = budget > 0 ? Math.round((overKcal / budget) * 1000) / 10 : 0;
  const penalty = Math.min(Math.round(overPct * CALORIE_PENALTY_PER_PCT), 100);
  const balanceScore = daysLogged > 0 ? 100 - penalty : 0;
  const loggingFactor = daysLogged / daysElapsed;

  return {
    from,
    to: last,
    daysElapsed,
    daysLogged,
    missingDates,
    consumed,
    budget,
    overKcal,
    overPct,
    penalty,
    balanceScore,
    loggingFactor,
    score: Math.round(balanceScore * loggingFactor),
  };
}

/** Average of week scores for every (partial) week from..today. */
export function calorieRangeScore(
  entries: CalorieEntry[],
  from: string,
  today: string,
  limit: number = CALORIE_DAILY_LIMIT
): number | null {
  const scores: number[] = [];
  for (let ws = weekStartStr(from); ws <= today; ws = addDays(ws, 7)) {
    const start = ws > from ? ws : from;
    const w = calorieWeekScore(entries, start, addDays(ws, 6), today, limit);
    if (w) scores.push(w.score);
  }
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

/**
 * Weighted health WIG score. When one part has no data yet,
 * the other carries the full weight.
 */
export function healthWigScore(rehab: number | null, calories: number | null): number | null {
  if (rehab === null && calories === null) return null;
  if (rehab === null) return calories;
  if (calories === null) return rehab;
  return Math.round(rehab * HEALTH_WEIGHTS.rehab + calories * HEALTH_WEIGHTS.calories);
}
