// Rehabilitation (physiotherapy) goals — replaces sport goals while active.
// Daily entry = % of prescribed rehab exercises done that day (0-100).

export type RehabPlan = {
  active: boolean;
  start: string; // YYYY-MM-DD (inclusive)
  end: string; // YYYY-MM-DD (inclusive)
  target: number; // daily % target
};

export type RehabEntry = {
  date: string; // YYYY-MM-DD
  percent: number;
  note?: string | null;
};

// 4 months from Monday 2026-10-19
export const DEFAULT_REHAB_PLAN: RehabPlan = {
  active: true,
  start: "2026-10-19",
  end: "2027-02-18",
  target: 100,
};

/** Local-time YYYY-MM-DD (avoids the toISOString() UTC shift). */
export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

/** Number of days from a to b, inclusive. */
export function daysInclusive(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000) + 1;
}

export function monthStartStr(today: string): string {
  return today.slice(0, 8) + "01";
}

export function weekStartStr(today: string): string {
  const d = parseDate(today);
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return toDateStr(d);
}

export function isPlanActive(plan: RehabPlan, today: string): boolean {
  return plan.active && today >= plan.start && today <= plan.end;
}

/**
 * Average daily % between from..to (inclusive), capped at today.
 * Past days without an entry count as 0%. Today without an entry is skipped
 * (the day isn't over yet). Returns null when no day counts yet.
 */
export function averagePercent(
  entries: RehabEntry[],
  from: string,
  to: string,
  today: string
): { avg: number | null; days: number } {
  const byDate = new Map(entries.map((e) => [e.date, e.percent]));
  const last = to < today ? to : today;
  let sum = 0;
  let days = 0;
  for (let d = from; d <= last; d = addDays(d, 1)) {
    const p = byDate.get(d);
    if (p === undefined && d === today) continue;
    sum += Math.min(Math.max(p ?? 0, 0), 100);
    days++;
  }
  return { avg: days > 0 ? Math.round(sum / days) : null, days };
}

/** Consecutive days (ending today, or yesterday if today has no entry) at >= target. */
export function currentStreak(entries: RehabEntry[], target: number, today: string, start: string): number {
  const byDate = new Map(entries.map((e) => [e.date, e.percent]));
  let d = byDate.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (d >= start && (byDate.get(d) ?? -1) >= target) {
    streak++;
    d = addDays(d, -1);
  }
  return streak;
}

export type RehabStats = {
  today: number | null;
  week: number | null;
  month: number | null;
  plan: number | null;
  streak: number;
  dayOfPlan: number;
  planDays: number;
};

export function rehabStats(plan: RehabPlan, entries: RehabEntry[], today: string): RehabStats {
  const clampFrom = (s: string) => (s > plan.start ? s : plan.start);
  const todayEntry = entries.find((e) => e.date === today);
  const planDays = daysInclusive(plan.start, plan.end);
  const dayOfPlan = Math.min(Math.max(daysInclusive(plan.start, today), 0), planDays);
  return {
    today: todayEntry ? todayEntry.percent : null,
    week: averagePercent(entries, clampFrom(weekStartStr(today)), plan.end, today).avg,
    month: averagePercent(entries, clampFrom(monthStartStr(today)), plan.end, today).avg,
    plan: averagePercent(entries, plan.start, plan.end, today).avg,
    streak: currentStreak(entries, plan.target, today, plan.start),
    dayOfPlan,
    planDays,
  };
}
