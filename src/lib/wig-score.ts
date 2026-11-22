// WIG Sessions 1.0: deterministic scoring. Pure functions, no I/O, no AI.
// Specification: docs/JAN_DASHBOARD_WIG_SPEC_2026-11-22.md (sections 2, 4–7) and docs/WIG_SESSIONS_SPEC.md (model A).
//
// Definitions
// - LEAD realization r (one week): at_least → actual/target; at_most → 1 if actual ≤ limit, else limit/actual;
//   range [min,max] → 1 inside, actual/min below, max/actual above. The raw value is kept; calculations use
//   min(r, 1.5).
// - Weekly area realization = Σ weight·min(r,1.5) / Σ weight over resolved, non-excused LEADs. If the excused weight
//   is more than half of the planned weight, the area has no data that week ("brak danych", never 0).
// - Rating 1–6: <50% = 1, 50–<70 = 2, 70–<85 = 3, 85–<95 = 4, 95–110 inclusive = 5, >110 = 6. The percentage is only
//   cleaned of float noise (1e-9) before the comparison, never rounded.
// - 4-week window, model A: per LEAD (stable lead_key) and only across comparable weeks (same unit and direction as
//   the newest week): at_least → Σ min(actual, 1.5·target) / Σ target (surpluses cover shortfalls in the same LEAD);
//   at_most / range → mean of the weekly capped realizations (no compensation for limits). Area window realization
//   = Σ W_L·R_L / Σ W_L with W_L = sum of that LEAD's weekly weights, then → rating. Ratings 1–6 are never averaged
//   for numeric areas. Weekly snapshots are never rewritten.
// - Relacje: weekly = Σ subweight·rating / Σ subweight over non-excused sub-areas (excused > 50% → no data);
//   window = recency-weighted mean 10/20/30/40 (oldest → newest) over weeks with a value. No carry-over of surpluses.
// - Main score = Σ area weight × area window value (numeric areas: rating 1–6; Relacje: weighted mean). Shown only
//   when every area has a value in the window; otherwise "brak danych" with the missing areas named.

export const ALGORITHM_VERSION = "wig-1";
export const CAP = 1.5;

export type AreaKey = "rozwoj" | "zdrowie" | "praca" | "relacje";
export const AREAS: { key: AreaKey; name: string; short: string; icon: string; weight: number; href: string }[] = [
  { key: "rozwoj", name: "Rozwój osobisty i duchowy", short: "Rozwój", icon: "📚", weight: 0.3, href: "/rozwoj" },
  { key: "zdrowie", name: "Zdrowie i fitness", short: "Zdrowie", icon: "💪", weight: 0.3, href: "/zdrowie" },
  { key: "praca", name: "Praca", short: "Praca", icon: "💼", weight: 0.25, href: "/praca" },
  { key: "relacje", name: "Partnerstwo i relacje", short: "Relacje", icon: "💛", weight: 0.15, href: "/relacje" },
];
export const AREA_WEIGHTS: Record<AreaKey, number> = { rozwoj: 0.3, zdrowie: 0.3, praca: 0.25, relacje: 0.15 };
export const NUMERIC_AREAS: AreaKey[] = ["rozwoj", "zdrowie", "praca"];

export type SubKey = "monika" | "dzieci" | "przyjaciele" | "pozostali";
export const RELATION_SUBS: { key: SubKey; name: string; weight: number }[] = [
  { key: "monika", name: "Monika", weight: 40 },
  { key: "dzieci", name: "Dzieci", weight: 35 },
  { key: "przyjaciele", name: "Przyjaciele", weight: 15 },
  { key: "pozostali", name: "Pozostali", weight: 10 },
];
/** Window weights for Relacje, oldest → newest. */
export const RELATION_RECENCY = [10, 20, 30, 40];

export type Direction = "at_least" | "at_most" | "range";
export type ResultStatus = "measured" | "manual" | "zero_confirmed" | "excused";

export type LeadInstance = {
  leadKey: string;
  name: string;
  unit: string;
  direction: Direction;
  target: number;
  targetMax?: number | null; // range only
  weight: number; // % inside the area
  actual: number | null;
  status: ResultStatus | null; // null = unresolved
};

const clean = (x: number) => Math.round(x * 1e9) / 1e9;

/** Raw (uncapped) realization of one LEAD in one week; null when it can't be computed. */
export function realization(l: Pick<LeadInstance, "direction" | "target" | "targetMax" | "actual">): number | null {
  if (l.actual === null || !Number.isFinite(l.actual) || l.actual < 0) return null;
  const a = l.actual;
  if (l.direction === "at_least") return l.target > 0 ? a / l.target : null;
  if (l.direction === "at_most") {
    if (!(l.target > 0)) return null;
    return a <= l.target ? 1 : l.target / a;
  }
  const min = l.target, max = l.targetMax ?? l.target;
  if (!(min > 0) || max < min) return null;
  if (a < min) return a / min;
  if (a > max) return max / a;
  return 1;
}

export const capped = (r: number) => Math.min(r, CAP);

/** Scale 1–6 from a realization ratio (1 = 100%). */
export function ratingFromRealization(r: number): number {
  const p = clean(r * 100);
  if (p < 50) return 1;
  if (p < 70) return 2;
  if (p < 85) return 3;
  if (p < 95) return 4;
  if (p <= 110) return 5;
  return 6;
}

export type WeekAreaResult = {
  realization: number | null; // capped, weighted
  rating: number | null;
  coverage: number; // share of the planned weight that has data (0–1)
  unresolved: number; // LEADs without a decision
  reason?: string;
};

/** One numeric area, one week. */
export function weekAreaResult(leads: LeadInstance[]): WeekAreaResult {
  if (leads.length === 0) return { realization: null, rating: null, coverage: 0, unresolved: 0, reason: "brak planu" };
  const planned = leads.reduce((s, l) => s + l.weight, 0);
  let w = 0, sum = 0, unresolved = 0;
  for (const l of leads) {
    if (l.status === null) { unresolved++; continue; }
    if (l.status === "excused") continue;
    const r = realization(l);
    if (r === null) { unresolved++; continue; }
    w += l.weight;
    sum += l.weight * capped(r);
  }
  const coverage = planned > 0 ? w / planned : 0;
  if (unresolved > 0) return { realization: null, rating: null, coverage, unresolved, reason: "nierozstrzygnięte braki" };
  if (w === 0 || coverage < 0.5) return { realization: null, rating: null, coverage, unresolved, reason: "za mało danych (usprawiedliwione)" };
  const R = sum / w;
  return { realization: R, rating: ratingFromRealization(R), coverage, unresolved };
}

export type RelationRating = { sub: SubKey; rating: number | null; excused: boolean };

/** Relacje, one week: weighted mean of the sub-area self-ratings. */
export function weekRelationResult(ratings: RelationRating[]): { value: number | null; unresolved: number; reason?: string } {
  let w = 0, sum = 0, unresolved = 0, total = 0;
  for (const s of RELATION_SUBS) {
    total += s.weight;
    const r = ratings.find((x) => x.sub === s.key);
    if (!r || (!r.excused && r.rating === null)) { unresolved++; continue; }
    if (r.excused) continue;
    const v = r.rating as number;
    if (!Number.isInteger(v) || v < 1 || v > 6) { unresolved++; continue; }
    w += s.weight;
    sum += s.weight * v;
  }
  if (unresolved > 0) return { value: null, unresolved, reason: "brak samooceny" };
  if (w === 0 || w / total < 0.5) return { value: null, unresolved, reason: "za mało danych (usprawiedliwione)" };
  return { value: sum / w, unresolved };
}

/** A closed week as stored in the snapshot. */
export type ClosedWeek = {
  weekStart: string;
  areaExcused: Partial<Record<AreaKey, boolean>>;
  leads: Record<"rozwoj" | "zdrowie" | "praca", LeadInstance[]>;
  relations: RelationRating[];
};

export type LeadWindow = { leadKey: string; name: string; unit: string; direction: Direction; weeks: number; realization: number; weightSum: number; droppedWeeks: number };
export type AreaWindow = {
  area: AreaKey;
  value: number | null; // numeric: rating 1–6; relacje: mean 1–6
  realization: number | null; // numeric only
  weeksWithData: number;
  leads: LeadWindow[];
  incomparable: boolean; // some weeks dropped because the LEAD definition changed
};

/** Window for one numeric area over closed weeks (oldest → newest). */
export function numericAreaWindow(area: "rozwoj" | "zdrowie" | "praca", weeks: ClosedWeek[]): AreaWindow {
  type Inst = LeadInstance & { week: string };
  const byKey = new Map<string, Inst[]>();
  let weeksWithData = 0;
  for (const wk of weeks) {
    if (wk.areaExcused[area]) continue;
    const res = weekAreaResult(wk.leads[area] ?? []);
    if (res.rating === null) continue; // a week without a valid area result contributes nothing
    weeksWithData++;
    for (const l of wk.leads[area]) {
      if (l.status === null || l.status === "excused" || realization(l) === null) continue;
      const arr = byKey.get(l.leadKey) ?? [];
      arr.push({ ...l, week: wk.weekStart });
      byKey.set(l.leadKey, arr);
    }
  }
  const leads: LeadWindow[] = [];
  let incomparable = false;
  for (const [key, inst] of byKey) {
    const newest = inst[inst.length - 1];
    const same = inst.filter((i) => i.unit === newest.unit && i.direction === newest.direction);
    const dropped = inst.length - same.length;
    if (dropped) incomparable = true;
    let R: number;
    if (newest.direction === "at_least") {
      const num = same.reduce((s, i) => s + Math.min(i.actual as number, CAP * i.target), 0);
      const den = same.reduce((s, i) => s + i.target, 0);
      R = num / den;
    } else {
      R = same.reduce((s, i) => s + capped(realization(i) as number), 0) / same.length;
    }
    leads.push({ leadKey: key, name: newest.name, unit: newest.unit, direction: newest.direction, weeks: same.length, realization: R, weightSum: same.reduce((s, i) => s + i.weight, 0), droppedWeeks: dropped });
  }
  const W = leads.reduce((s, l) => s + l.weightSum, 0);
  if (W === 0) return { area, value: null, realization: null, weeksWithData, leads, incomparable };
  const R = leads.reduce((s, l) => s + l.weightSum * l.realization, 0) / W;
  return { area, value: ratingFromRealization(R), realization: R, weeksWithData, leads, incomparable };
}

/** Window for Relacje. `slots` = the window's weeks oldest → newest (closed or not); missing weeks are skipped. */
export function relationWindow(slots: (ClosedWeek | null)[]): AreaWindow {
  const weights = RELATION_RECENCY.slice(RELATION_RECENCY.length - slots.length);
  let w = 0, sum = 0, n = 0;
  slots.forEach((wk, i) => {
    if (!wk || wk.areaExcused.relacje) return;
    const v = weekRelationResult(wk.relations).value;
    if (v === null) return;
    n++;
    w += weights[i];
    sum += weights[i] * v;
  });
  return { area: "relacje", value: w ? sum / w : null, realization: null, weeksWithData: n, leads: [], incomparable: false };
}

export type MainScore = {
  value: number | null; // 1.0–6.0, one decimal for display
  areas: AreaWindow[];
  closedWeeks: number; // coverage n/4
  windowWeeks: string[]; // week starts, oldest → newest
  missingAreas: AreaKey[];
  provisional: boolean;
  algorithm: string;
};

/** Main score for a window. `slots` = window weeks oldest → newest, null where the week is not closed. */
export function mainScore(windowWeeks: string[], slots: (ClosedWeek | null)[]): MainScore {
  const closed = slots.filter((s): s is ClosedWeek => s !== null);
  const areas: AreaWindow[] = [
    numericAreaWindow("rozwoj", closed),
    numericAreaWindow("zdrowie", closed),
    numericAreaWindow("praca", closed),
    relationWindow(slots),
  ];
  const missingAreas = areas.filter((a) => a.value === null).map((a) => a.area);
  const value = missingAreas.length ? null : areas.reduce((s, a) => s + AREA_WEIGHTS[a.area] * (a.value as number), 0);
  return { value, areas, closedWeeks: closed.length, windowWeeks, missingAreas, provisional: closed.length < 4, algorithm: ALGORITHM_VERSION };
}

/** One-decimal display; never shows a fake zero. */
export const formatScore = (v: number | null) => (v === null ? "—" : (Math.round(v * 10) / 10).toFixed(1).replace(".", ","));
export const formatPct = (r: number | null) => (r === null ? "—" : `${Math.round(r * 1000) / 10}%`.replace(".", ","));

/**
 * The 4 weeks of the window, oldest → newest (Monday dates). The anchor is the current week once it is closed,
 * otherwise the previous (finished) week — an open week never drags the score down.
 */
export function windowWeekStarts(currentWeekStart: string, currentWeekClosed: boolean, addDays: (iso: string, n: number) => string): string[] {
  const anchor = currentWeekClosed ? currentWeekStart : addDays(currentWeekStart, -7);
  return [-21, -14, -7, 0].map((d) => addDays(anchor, d));
}
