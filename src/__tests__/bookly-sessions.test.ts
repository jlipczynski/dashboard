import { describe, it, expect } from "vitest";
import { dedupeSessions, normTitle, sessionDays, sessionError, sessionKey, shortTitle, type BooklySession } from "../lib/bookly-sessions";
import { yearTitles, type BooklyReport } from "../lib/reading";

const s = (date: string, title: string, pages: number, seconds: number): BooklySession => ({ date, title, author: "", pages, seconds });

describe("sessionError", () => {
  const today = "2026-11-25";
  it("accepts a complete card", () => {
    expect(sessionError(s("2026-11-25", "Rocket Fuel", 16, 1513), today)).toBeNull();
    expect(sessionError(s("2026-11-25", "Rocket Fuel", 0, 0), today)).toBeNull();
  });
  it("rejects bad or future dates, empty titles, negative or fractional numbers", () => {
    expect(sessionError(s("2026-11-26", "X", 1, 1), today)).toBe("data w przyszłości");
    expect(sessionError(s("25 Nov 2026", "X", 1, 1), today)).toBe("nieprawidłowa data");
    expect(sessionError(s("2026-11-01", "  ", 1, 1), today)).toBe("brak tytułu");
    expect(sessionError(s("2026-11-01", "X", -1, 1), today)).toBe("nieprawidłowa liczba stron");
    expect(sessionError(s("2026-11-01", "X", 1, 1.5), today)).toBe("nieprawidłowy czas");
  });
});

describe("dedupe + per day", () => {
  // Real cards: 15 Nov 2026 seen on two neighbouring screenshots
  const cards = [
    s("2026-11-16", "Rocket Fuel", 23, 1897),
    s("2026-11-15", "Rocket Fuel", 13, 1417),
    s("2026-11-15", "Myśl I Bogać Się", 27, 1235),
    s("2026-11-15", "Myśl I Bogać Się", 27, 1235), // next screenshot repeats the card
    s("2026-11-15", "Rocket Fuel", 26, 1817),
    s("2026-11-15", "Kod Otyłości", 21, 1234),
  ];
  it("same date, title, pages and seconds = one session (DB unique key)", () => {
    expect(dedupeSessions(cards)).toHaveLength(5);
    expect(sessionKey(cards[2])).toBe(sessionKey(cards[3]));
  });
  it("15 Nov: 4 sessions, 87 pages, 5703 s", () => {
    const d = sessionDays(dedupeSessions(cards)).find((x) => x.date === "2026-11-15")!;
    expect(d).toEqual({ date: "2026-11-15", sessions: 4, pages: 87, seconds: 5703 });
  });
});

describe("titles", () => {
  it("shortTitle keeps the part before ':'", () => {
    expect(shortTitle("Flow: The Classic Work on How to Achieve Happiness")).toBe("Flow");
    expect(shortTitle("Rocket Fuel")).toBe("Rocket Fuel");
  });
  it("normTitle ignores case and Polish diacritics", () => {
    expect(normTitle("Myśl I Bogać Się")).toBe(normTitle("Mysl i bogac sie"));
    expect(normTitle("Kod Otyłości")).toBe("kod otylosci");
  });
  it("shelf lists titles from all reports of the year without duplicates", () => {
    const r = (from: string, to: string, titles: string[]): BooklyReport => ({
      period_from: from, period_to: to, minutes: 0, pages: 0, reading_days: 0, books_finished: titles.length, finished_titles: titles,
    });
    expect(
      yearTitles(
        [
          r("2026-01-01", "2026-10-20", ["Głodny mózg", "Siła dobrych nawyków"]),
          r("2026-10-01", "2026-10-20", ["Glodny mozg"]),
          r("2026-11-01", "2026-11-25", ["Myśl i bogać się", "Traction", "Rocket Fuel"]),
          r("2025-12-01", "2025-12-31", ["Old"]),
        ],
        2026
      )
    ).toEqual(["Głodny mózg", "Siła dobrych nawyków", "Myśl i bogać się", "Traction", "Rocket Fuel"]);
  });
});
