import { describe, it, expect } from "vitest";
import {
  booksInDays,
  buildDayReports,
  dedupeSessions,
  gapDays,
  normTitle,
  sessionDays,
  type BooklySession,
} from "../lib/bookly-sessions";
import { dailyValues, rangeStats, yearTitles, type BooklyReport } from "../lib/reading";

const s = (date: string, title: string, pages: number, t: string): BooklySession => {
  const [m, sec] = t.split(":").map(Number);
  return { date: `2026-${date}`, title, author: "", pages, seconds: m * 60 + sec };
};

// Real Bookly sessions 1–17 Nov 2026, as read from overlapping screenshots:
// cards at a screenshot's edge appear again on the next one.
const NOV_1_17: BooklySession[] = [
  s("11-17", "Rocket Fuel", 24, "30:43"),
  s("11-16", "Rocket Fuel", 23, "31:37"),
  s("11-16", "Rocket Fuel", 23, "31:37"), // duplicate (next screenshot)
  s("11-15", "Rocket Fuel", 13, "23:37"),
  s("11-15", "Myśl I Bogać Się", 27, "20:35"),
  s("11-15", "Myśl i bogać się", 27, "20:35"), // duplicate, other spelling
  s("11-15", "Rocket Fuel", 26, "30:17"),
  s("11-15", "Kod Otyłości", 21, "20:34"),
  s("11-14", "Rocket Fuel", 17, "24:32"),
  s("11-13", "Rocket Fuel", 18, "33:53"),
  s("11-12", "Traction", 61, "36:14"),
  s("11-11", "Myśl I Bogać Się", 9, "6:53"),
  s("11-11", "Traction", 6, "22:32"),
  s("11-11", "Stolen Focus", 11, "31:00"),
  s("11-10", "Traction", 17, "30:47"),
  s("11-09", "Traction", 14, "33:27"),
  s("11-08", "Traction", 18, "36:27"),
  s("11-07", "Traction", 13, "36:54"),
  s("11-06", "Traction", 6, "18:44"),
  s("11-06", "Traction", 16, "30:37"),
  s("11-05", "Traction", 18, "34:19"),
  s("11-05", "Traction", 18, "34:19"), // duplicate
  s("11-04", "Traction", 16, "31:03"),
  s("11-03", "Traction", 18, "32:01"),
  s("11-02", "Traction", 10, "15:27"),
  s("11-01", "Traction", 15, "31:58"),
];

describe("session screenshots → days", () => {
  it("drops cards repeated on neighbouring screenshots", () => {
    expect(dedupeSessions(NOV_1_17)).toHaveLength(23);
  });

  it("matches the Bookly report for 1–17 Nov (644 min, 417 pages, 17 days)", () => {
    const days = sessionDays(dedupeSessions(NOV_1_17));
    const reports = buildDayReports(days, []);
    expect(reports).toHaveLength(17);
    expect(reports.reduce((a, r) => a + r.minutes, 0)).toBe(644);
    expect(reports.reduce((a, r) => a + r.pages, 0)).toBe(417);
    expect(reports.every((r) => r.period_from === r.period_to && r.reading_days === 1 && r.source === "sessions")).toBe(true);
  });

  it("15 Nov has four sessions of three distinct books", () => {
    const d = sessionDays(dedupeSessions(NOV_1_17)).find((x) => x.date === "2026-11-15")!;
    expect(d.sessions).toBe(4);
    expect(d.pages).toBe(87);
    expect(d.titles).toEqual(["Rocket Fuel", "Myśl I Bogać Się", "Kod Otyłości"]);
  });

  it("a finished book counts on the day of its last session", () => {
    const days = sessionDays(dedupeSessions(NOV_1_17));
    const books = booksInDays(days);
    expect(books.find((b) => b.title === "Traction")?.lastDate).toBe("2026-11-12");
    const reports = buildDayReports(days, ["Traction", "myśl i bogać się"]);
    const withBooks = reports.filter((r) => r.books_finished > 0);
    expect(withBooks.map((r) => [r.period_from, r.finished_titles])).toEqual([
      ["2026-11-12", ["Traction"]],
      ["2026-11-15", ["Myśl I Bogać Się"]],
    ]);
  });

  it("gap days are reported and only saved as 0 when asked", () => {
    const days = sessionDays([s("11-01", "A", 5, "10:00"), s("11-04", "A", 5, "10:00")]);
    expect(gapDays(days)).toEqual(["2026-11-02", "2026-11-03"]);
    expect(buildDayReports(days, [])).toHaveLength(2);
    const withZeros = buildDayReports(days, [], ["2026-11-02", "2026-11-03"]);
    expect(withZeros.map((r) => [r.period_from, r.minutes])).toEqual([
      ["2026-11-01", 10],
      ["2026-11-02", 0],
      ["2026-11-03", 0],
      ["2026-11-04", 10],
    ]);
  });

  it("normTitle ignores case and Polish diacritics", () => {
    expect(normTitle("Myśl I Bogać Się")).toBe(normTitle("Mysl i bogac sie"));
    expect(normTitle("Kod Otyłości")).toBe("kod otylosci");
  });
});

describe("day reports alongside summary reports", () => {
  const r = (from: string, to: string, minutes: number, pages: number, days: number, books: number, titles: string[] = []): BooklyReport => ({
    period_from: from, period_to: to, minutes, pages, reading_days: days, books_finished: books, finished_titles: titles,
  });

  it("no double counting with the existing 1–17 / 1–25 Nov reports", () => {
    const dayReports = buildDayReports(sessionDays(dedupeSessions(NOV_1_17)), ["Traction", "Myśl i bogać się"]);
    const all: BooklyReport[] = [
      r("2026-11-01", "2026-11-17", 644, 417, 17, 2),
      r("2026-11-01", "2026-11-25", 1010, 586, 25, 3),
      ...dayReports,
    ];
    const s = rangeStats(dailyValues(all), "2026-11-01", "2026-11-30", "2026-11-25");
    expect(s.coveredDays).toBe(25);
    expect(s.minutes).toBe(1010);
    expect(s.pages).toBe(586);
    expect(s.books).toBe(3);
  });

  it("shelf lists titles from all reports of the year without duplicates", () => {
    const titles = yearTitles(
      [
        r("2026-01-01", "2026-10-20", 0, 0, 0, 2, ["Głodny mózg", "Siła dobrych nawyków"]),
        r("2026-10-01", "2026-10-20", 0, 0, 0, 1, ["Glodny mozg"]),
        r("2026-11-01", "2026-11-25", 0, 0, 0, 3, ["Myśl i bogać się", "Traction", "Rocket Fuel"]),
        r("2026-11-12", "2026-11-12", 0, 0, 1, 1, ["Traction"]),
        r("2025-12-01", "2025-12-31", 0, 0, 0, 1, ["Old"]),
      ],
      2026
    );
    expect(titles).toEqual(["Głodny mózg", "Siła dobrych nawyków", "Myśl i bogać się", "Traction", "Rocket Fuel"]);
  });
});
