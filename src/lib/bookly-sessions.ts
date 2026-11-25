// Bookly "Reading Sessions" screenshots → one report per day.
//
// A session list is scrolled over several screenshots, so neighbouring
// screenshots repeat cards. Sessions are de-duplicated by date + pages +
// read time (to the second), then summed per day. Each day is saved as a
// one-day report — the most precise segment for dailyValues() in reading.ts,
// so it wins over longer overlapping reports without double counting.

import { addDays } from "./rehab";

export type BooklySession = {
  date: string; // YYYY-MM-DD
  title: string;
  author: string;
  pages: number;
  seconds: number;
};

export type SessionDay = {
  date: string;
  sessions: number;
  seconds: number;
  pages: number;
  titles: string[];
};

export type DayReportInput = {
  period_from: string;
  period_to: string;
  minutes: number;
  pages: number;
  reading_days: number;
  books_finished: number;
  finished_titles: string[];
  source: "sessions";
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Case/diacritics-insensitive title key ("Myśl I Bogać Się" = "Myśl i bogać się"). */
export function normTitle(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isValidSession(s: Partial<BooklySession>): s is BooklySession {
  return (
    typeof s.date === "string" &&
    DATE_RE.test(s.date) &&
    typeof s.title === "string" &&
    s.title.trim().length > 0 &&
    Number.isInteger(s.pages) &&
    (s.pages as number) >= 0 &&
    Number.isInteger(s.seconds) &&
    (s.seconds as number) > 0
  );
}

/** Same date, pages and read time to the second = the same card seen twice. */
export function dedupeSessions(list: BooklySession[]): BooklySession[] {
  const seen = new Set<string>();
  const out: BooklySession[] = [];
  for (const s of list) {
    const key = `${s.date}|${s.pages}|${s.seconds}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/** Sessions summed per day, oldest first. Titles keep the first spelling seen. */
export function sessionDays(sessions: BooklySession[]): SessionDay[] {
  const map = new Map<string, SessionDay & { keys: Set<string> }>();
  for (const s of sessions) {
    const d = map.get(s.date) ?? { date: s.date, sessions: 0, seconds: 0, pages: 0, titles: [], keys: new Set<string>() };
    d.sessions++;
    d.seconds += s.seconds;
    d.pages += s.pages;
    const k = normTitle(s.title);
    if (!d.keys.has(k)) {
      d.keys.add(k);
      d.titles.push(s.title.trim());
    }
    map.set(s.date, d);
  }
  return [...map.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ date: d.date, sessions: d.sessions, seconds: d.seconds, pages: d.pages, titles: d.titles }));
}

/** Days between the first and last session day with no session at all. */
export function gapDays(days: SessionDay[]): string[] {
  if (days.length === 0) return [];
  const have = new Set(days.map((d) => d.date));
  const out: string[] = [];
  for (let d = days[0].date; d <= days[days.length - 1].date; d = addDays(d, 1)) {
    if (!have.has(d)) out.push(d);
  }
  return out;
}

/** Distinct books with the day of their last session (within the given days). */
export function booksInDays(days: SessionDay[]): { title: string; lastDate: string }[] {
  const map = new Map<string, { title: string; lastDate: string }>();
  for (const d of days) {
    for (const t of d.titles) {
      const k = normTitle(t);
      const cur = map.get(k);
      if (!cur) map.set(k, { title: t, lastDate: d.date });
      else if (d.date > cur.lastDate) cur.lastDate = d.date;
    }
  }
  return [...map.values()].sort((a, b) => b.lastDate.localeCompare(a.lastDate) || a.title.localeCompare(b.title));
}

/**
 * One report per included day. A finished book counts on the day of its last
 * session. Gap days become 0-minute reports only when explicitly listed.
 */
export function buildDayReports(
  days: SessionDay[],
  finishedTitles: string[],
  zeroDays: string[] = []
): DayReportInput[] {
  const finishedOn = new Map<string, string[]>();
  const books = booksInDays(days);
  for (const t of finishedTitles) {
    const b = books.find((x) => normTitle(x.title) === normTitle(t));
    if (!b) continue;
    finishedOn.set(b.lastDate, [...(finishedOn.get(b.lastDate) ?? []), b.title]);
  }
  // Cumulative rounding: day minutes add up to the rounded total of all seconds
  let cumSec = 0;
  let cumMin = 0;
  const out: DayReportInput[] = days.map((d) => {
    const fin = finishedOn.get(d.date) ?? [];
    cumSec += d.seconds;
    const minutes = Math.round(cumSec / 60) - cumMin;
    cumMin += minutes;
    return {
      period_from: d.date,
      period_to: d.date,
      minutes,
      pages: d.pages,
      reading_days: d.seconds > 0 ? 1 : 0,
      books_finished: fin.length,
      finished_titles: fin,
      source: "sessions",
    };
  });
  const have = new Set(days.map((d) => d.date));
  for (const z of zeroDays) {
    if (have.has(z) || !DATE_RE.test(z)) continue;
    out.push({ period_from: z, period_to: z, minutes: 0, pages: 0, reading_days: 0, books_finished: 0, finished_titles: [], source: "sessions" });
  }
  return out.sort((a, b) => a.period_from.localeCompare(b.period_from));
}
