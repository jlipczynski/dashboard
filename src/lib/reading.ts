// Reading WIG fed by Bookly reading reports (aggregates for a date range).
// Lead: >= 30 min of reading per day. Lag: books finished per year (50).
//
// Reports may cover any range and may overlap (month-to-date, year-to-date…).
// They are turned into per-day values without double counting:
//  1. Reports sharing a start date are cumulative — consecutive differences
//     give exact segments (1–20 Oct and 1–31 Oct → 1–20 + 21–31).
//  2. Segments are spread evenly over their days, shortest (most precise)
//     first; a longer segment only fills days not yet covered, with what is
//     left after subtracting the days already covered.

import { addDays, daysInclusive } from "./rehab";

export const READING_DAILY_MINUTES = 30;
export const BOOKS_PER_YEAR = 50;

/** User-editable reading goals (stored in fitness_goals.goals.reading). */
export type ReadingSettings = { dailyMinutes: number; booksPerYear: number };
export const DEFAULT_READING_SETTINGS: ReadingSettings = {
  dailyMinutes: READING_DAILY_MINUTES,
  booksPerYear: BOOKS_PER_YEAR,
};

export type BooklyReport = {
  id?: string;
  period_from: string;
  period_to: string;
  minutes: number;
  pages: number;
  reading_days: number;
  books_finished: number;
  finished_titles?: string[] | null;
  source?: string | null;
};

type Totals = { minutes: number; pages: number; readingDays: number; books: number };

const ZERO: Totals = { minutes: 0, pages: 0, readingDays: 0, books: 0 };

function totalsOf(r: BooklyReport): Totals {
  return { minutes: r.minutes, pages: r.pages, readingDays: r.reading_days, books: r.books_finished };
}

function sub(a: Totals, b: Totals): Totals {
  return {
    minutes: a.minutes - b.minutes,
    pages: a.pages - b.pages,
    readingDays: a.readingDays - b.readingDays,
    books: a.books - b.books,
  };
}

type Segment = { from: string; to: string; totals: Totals };

/** Exact segments derived from reports (cumulative groups → differences). */
export function reportSegments(reports: BooklyReport[]): Segment[] {
  const groups = new Map<string, BooklyReport[]>();
  for (const r of reports) {
    if (!r.period_from || !r.period_to || r.period_to < r.period_from) continue;
    const g = groups.get(r.period_from) ?? [];
    g.push(r);
    groups.set(r.period_from, g);
  }
  const segments: Segment[] = [];
  for (const [from, group] of groups) {
    group.sort((a, b) => a.period_to.localeCompare(b.period_to));
    let prevTo: string | null = null;
    let prev: Totals = ZERO;
    for (const r of group) {
      if (prevTo === r.period_to) continue; // same range twice — keep the first
      const cur = totalsOf(r);
      const diff = sub(cur, prev);
      // A later cumulative report should never be smaller; clamp just in case.
      segments.push({
        from: prevTo ? addDays(prevTo, 1) : from,
        to: r.period_to,
        totals: {
          minutes: Math.max(diff.minutes, 0),
          pages: Math.max(diff.pages, 0),
          readingDays: Math.max(diff.readingDays, 0),
          books: Math.max(diff.books, 0),
        },
      });
      prevTo = r.period_to;
      prev = cur;
    }
  }
  return segments;
}

export type DayValues = Map<string, Totals>;

/** Spread segments over days, shortest first, without double counting. */
export function dailyValues(reports: BooklyReport[]): DayValues {
  const days: DayValues = new Map();
  const segments = reportSegments(reports).sort(
    (a, b) => daysInclusive(a.from, a.to) - daysInclusive(b.from, b.to) || a.from.localeCompare(b.from)
  );
  for (const seg of segments) {
    let covered: Totals = ZERO;
    const free: string[] = [];
    for (let d = seg.from; d <= seg.to; d = addDays(d, 1)) {
      const v = days.get(d);
      if (v) covered = { minutes: covered.minutes + v.minutes, pages: covered.pages + v.pages, readingDays: covered.readingDays + v.readingDays, books: covered.books + v.books };
      else free.push(d);
    }
    if (free.length === 0) continue;
    const rest = sub(seg.totals, covered);
    const per: Totals = {
      minutes: Math.max(rest.minutes, 0) / free.length,
      pages: Math.max(rest.pages, 0) / free.length,
      readingDays: Math.min(Math.max(rest.readingDays, 0) / free.length, 1),
      books: Math.max(rest.books, 0) / free.length,
    };
    for (const d of free) days.set(d, per);
  }
  return days;
}

export type RangeStats = {
  from: string;
  to: string;
  days: number; // calendar days in range (capped at today)
  coveredDays: number; // days with report data
  coveredUntil: string | null; // last covered day
  minutes: number;
  pages: number;
  readingDays: number;
  books: number;
  avgMinutesPerDay: number | null; // over covered days
  leadScore: number | null; // avg / 30 min, capped at 100
};

export function rangeStats(
  days: DayValues,
  from: string,
  to: string,
  today: string,
  dailyMinutes: number = READING_DAILY_MINUTES
): RangeStats {
  const last = to < today ? to : today;
  let n = 0;
  let covered = 0;
  let coveredUntil: string | null = null;
  const t = { minutes: 0, pages: 0, readingDays: 0, books: 0 };
  for (let d = from; d <= last; d = addDays(d, 1)) {
    n++;
    const v = days.get(d);
    if (!v) continue;
    covered++;
    coveredUntil = d;
    t.minutes += v.minutes;
    t.pages += v.pages;
    t.readingDays += v.readingDays;
    t.books += v.books;
  }
  const avg = covered > 0 ? t.minutes / covered : null;
  return {
    from,
    to: last,
    days: n,
    coveredDays: covered,
    coveredUntil,
    minutes: Math.round(t.minutes),
    pages: Math.round(t.pages),
    readingDays: Math.round(t.readingDays),
    books: Math.round(t.books * 10) / 10,
    avgMinutesPerDay: avg === null ? null : Math.round(avg),
    leadScore: avg === null || dailyMinutes <= 0 ? null : Math.round(Math.min(avg / dailyMinutes, 1) * 100),
  };
}

export type YearSummary = RangeStats & {
  year: number;
  booksTarget: number;
  /** Books expected by the last covered day at an even pace towards the target. */
  booksExpected: number;
  /** Projected books for the whole year at the current pace. */
  booksProjected: number | null;
  /** Share of the yearly target already done (0-100, capped). */
  targetPct: number;
  /** Books per week still needed from the last covered day to hit the target. */
  booksPerWeekNeeded: number | null;
};

export function yearSummary(
  days: DayValues,
  year: number,
  today: string,
  settings: ReadingSettings = DEFAULT_READING_SETTINGS
): YearSummary {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const s = rangeStats(days, from, to, today, settings.dailyMinutes);
  const target = settings.booksPerYear;
  const yearDays = daysInclusive(from, to);
  const elapsed = s.coveredUntil ? daysInclusive(from, s.coveredUntil) : 0;
  const daysLeft = yearDays - elapsed;
  const booksLeft = Math.max(target - s.books, 0);
  return {
    ...s,
    year,
    booksTarget: target,
    booksExpected: Math.round((target * elapsed) / yearDays * 10) / 10,
    booksProjected: elapsed > 0 ? Math.round((s.books / elapsed) * yearDays) : null,
    targetPct: target > 0 ? Math.round(Math.min(s.books / target, 1) * 100) : 0,
    booksPerWeekNeeded: daysLeft > 0 ? Math.round((booksLeft / daysLeft) * 7 * 10) / 10 : null,
  };
}

/**
 * This month's reading for pillar scoring, or null when no report covers it.
 * Expressed as minutes done vs a target of 30 min × covered days.
 */
export function booklyMonthReading(
  reports: BooklyReport[],
  today: string,
  dailyMinutes: number = READING_DAILY_MINUTES
): { minutes: number; target: number; coveredDays: number } | null {
  const s = rangeStats(dailyValues(reports), today.slice(0, 8) + "01", today, today, dailyMinutes);
  if (s.coveredDays === 0) return null;
  return { minutes: s.minutes, target: dailyMinutes * s.coveredDays, coveredDays: s.coveredDays };
}
