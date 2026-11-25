import { describe, it, expect } from "vitest";
import { booklyMonthReading, dailyValues, rangeStats, reportSegments, yearSummary, type BooklyReport } from "../lib/reading";

const r = (from: string, to: string, minutes: number, pages = 0, days = 0, books = 0): BooklyReport => ({
  period_from: from,
  period_to: to,
  minutes,
  pages,
  reading_days: days,
  books_finished: books,
});

// The real first report: 1–20 Oct 2026, 18h21m, 921 pages, 20/20 days, 4 books
const OCT_1_20 = r("2026-10-01", "2026-10-20", 1101, 921, 20, 4);

describe("reportSegments", () => {
  it("cumulative reports with the same start become exact segments", () => {
    const segs = reportSegments([r("2026-10-01", "2026-10-31", 1600, 1300, 30, 6), OCT_1_20]);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ from: "2026-10-01", to: "2026-10-20" });
    expect(segs[1]).toMatchObject({ from: "2026-10-21", to: "2026-10-31", totals: { minutes: 499, pages: 379, books: 2 } });
  });

  it("identical range imported twice counts once", () => {
    expect(reportSegments([OCT_1_20, { ...OCT_1_20 }])).toHaveLength(1);
  });
});

describe("dailyValues + rangeStats", () => {
  it("first real report: 55 min/day avg, lead 100%", () => {
    const s = rangeStats(dailyValues([OCT_1_20]), "2026-10-01", "2026-10-31", "2026-10-20");
    expect(s.minutes).toBe(1101);
    expect(s.pages).toBe(921);
    expect(s.coveredDays).toBe(20);
    expect(s.avgMinutesPerDay).toBe(55);
    expect(s.leadScore).toBe(100);
    expect(s.books).toBe(4);
  });

  it("lead score scales below 30 min/day", () => {
    const s = rangeStats(dailyValues([r("2026-11-01", "2026-11-10", 150)]), "2026-11-01", "2026-11-30", "2026-11-10");
    expect(s.avgMinutesPerDay).toBe(15);
    expect(s.leadScore).toBe(50);
  });

  it("year report + month report overlap without double counting", () => {
    const year = r("2026-01-01", "2026-10-20", 9000, 8000, 280, 40);
    const days = dailyValues([year, OCT_1_20]);
    const y = rangeStats(days, "2026-01-01", "2026-12-31", "2026-10-20");
    expect(y.minutes).toBe(9000);
    expect(y.books).toBe(40);
    // October comes from the precise month report
    const oct = rangeStats(days, "2026-10-01", "2026-10-31", "2026-10-20");
    expect(oct.minutes).toBe(1101);
  });

  it("uncovered days are not counted as zero reading", () => {
    const s = rangeStats(dailyValues([OCT_1_20]), "2026-10-01", "2026-10-31", "2026-10-25");
    expect(s.coveredDays).toBe(20);
    expect(s.coveredUntil).toBe("2026-10-20");
    expect(s.avgMinutesPerDay).toBe(55);
  });
});

describe("yearSummary", () => {
  it("books vs 50/year target and pace", () => {
    const y = yearSummary(dailyValues([r("2026-01-01", "2026-10-20", 9000, 8000, 280, 40)]), 2026, "2026-10-20");
    expect(y.books).toBe(40);
    expect(y.booksTarget).toBe(50);
    // day 293 of 365 → expected 40.1
    expect(y.booksExpected).toBe(40.1);
    expect(y.booksProjected).toBe(50);
  });
});

describe("reading settings", () => {
  it("year target % and books/week needed", () => {
    const y = yearSummary(dailyValues([r("2026-01-01", "2026-10-20", 8129, 7562, 202, 24)]), 2026, "2026-10-20");
    expect(y.targetPct).toBe(48); // 24 / 50
    // 26 books left over 72 days → 2.5 / week
    expect(y.booksPerWeekNeeded).toBe(2.5);
  });

  it("custom daily minutes changes the lead score", () => {
    const s = rangeStats(dailyValues([r("2026-11-01", "2026-11-10", 300)]), "2026-11-01", "2026-11-30", "2026-11-10", 60);
    expect(s.avgMinutesPerDay).toBe(30);
    expect(s.leadScore).toBe(50);
  });
});

describe("sessions take precedence, reports fill the rest", () => {
  const ses = (date: string, pages: number, seconds: number) => ({ date, pages, seconds });
  // Real Bookly sessions 1–17 Nov 2026 (23 sessions, 417 pages, 38 651 s)
  const NOV_1_17 = [
    ses("2026-11-01", 15, 1918), ses("2026-11-02", 10, 927), ses("2026-11-03", 18, 1921), ses("2026-11-04", 16, 1863),
    ses("2026-11-05", 18, 2059), ses("2026-11-06", 6, 1124), ses("2026-11-06", 16, 1837), ses("2026-11-07", 13, 2214),
    ses("2026-11-08", 18, 2187), ses("2026-11-09", 14, 2007), ses("2026-11-10", 17, 1847), ses("2026-11-11", 9, 413),
    ses("2026-11-11", 11, 1860), ses("2026-11-11", 6, 1352), ses("2026-11-12", 61, 2174), ses("2026-11-13", 18, 2033),
    ses("2026-11-14", 17, 1472), ses("2026-11-15", 21, 1234), ses("2026-11-15", 27, 1235), ses("2026-11-15", 13, 1417),
    ses("2026-11-15", 26, 1817), ses("2026-11-16", 23, 1897), ses("2026-11-17", 24, 1843),
  ];

  it("report 1–17 Nov + sessions every day: no double counting, books from the report", () => {
    expect(NOV_1_17.reduce((a, x) => a + x.seconds, 0)).toBe(38651);
    const days = dailyValues([r("2026-11-01", "2026-11-17", 644, 417, 17, 2)], NOV_1_17);
    const s = rangeStats(days, "2026-11-01", "2026-11-17", "2026-11-25");
    expect(s).toMatchObject({ pages: 417, minutes: 644, readingDays: 17, books: 2 });
  });

  it("report 1–20 Oct + sessions 30–31 Oct", () => {
    const sessions = [ses("2026-10-30", 27, 2102), ses("2026-10-31", 34, 2413), ses("2026-10-31", 38, 315)];
    const s = rangeStats(dailyValues([OCT_1_20], sessions), "2026-10-01", "2026-10-31", "2026-11-25");
    expect(s).toMatchObject({ pages: 1020, minutes: 1182, readingDays: 22, coveredDays: 22, books: 4 });
  });

  it("report 1–10 Nov + sessions only 1–5: days 6–10 get the rest", () => {
    const sessions = [1, 2, 3, 4, 5].map((d) => ses(`2026-11-0${d}`, 10, 1200)); // 50 pages, 6000 s
    const days = dailyValues([r("2026-11-01", "2026-11-10", 300, 100, 10, 0)], sessions);
    for (const d of ["2026-11-06", "2026-11-08", "2026-11-10"]) {
      expect(days.get(d)?.pages).toBeCloseTo(10);
      expect(days.get(d)?.minutes).toBeCloseTo(40);
    }
    expect(rangeStats(days, "2026-11-01", "2026-11-10", "2026-11-25")).toMatchObject({ pages: 100, minutes: 300 });
  });

  it("sessions only: sums of sessions, no books", () => {
    const s = rangeStats(dailyValues([], NOV_1_17), "2026-11-01", "2026-11-30", "2026-11-25");
    expect(s).toMatchObject({ pages: 417, minutes: 644, readingDays: 17, coveredDays: 17, books: 0 });
  });

  it("booklyMonthReading counts sessions without a report", () => {
    expect(booklyMonthReading([], NOV_1_17, "2026-11-25")).toEqual({ minutes: 644, target: 510, coveredDays: 17 });
  });
});
