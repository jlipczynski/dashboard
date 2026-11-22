// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  todayWarsaw,
  addDaysIso,
  isoDayOfWeek,
  weekStartIso,
  monthStartIso,
  monthDatesUpTo,
  weekStartsOfMonthUpTo,
  isoWeekNumber,
  formatDayMonthPl,
} from "../lib/dates";

describe("todayWarsaw — the calendar day in Poland, whatever the machine's time zone", () => {
  it("23:30 UTC on 21.11 is already 22.11 in Warsaw (winter, UTC+1)", () => {
    expect(todayWarsaw(new Date("2026-11-21T23:30:00Z"))).toBe("2026-11-22");
  });
  it("22:30 UTC on 30.06 is already 1.07 in Warsaw (summer, UTC+2)", () => {
    expect(todayWarsaw(new Date("2026-06-30T22:30:00Z"))).toBe("2026-07-01");
  });
  it("00:30 Warsaw on 1.11 is still 31.10 in UTC — the day must be 1.11 (regression: toISOString gave the previous day)", () => {
    const now = new Date("2026-10-31T23:30:00Z"); // 00:30 in Warsaw
    expect(now.toISOString().split("T")[0]).toBe("2026-10-31"); // the old, wrong way
    expect(todayWarsaw(now)).toBe("2026-11-01");
  });
});

describe("week start — Monday, no shift to Sunday", () => {
  it("every day of 16–22.11.2026 belongs to the week of Monday 16.11", () => {
    for (let i = 0; i < 7; i++) expect(weekStartIso(addDaysIso("2026-11-16", i))).toBe("2026-11-16");
  });
  it("Sunday 22.11 → Monday 16.11, Monday 23.11 → itself", () => {
    expect(isoDayOfWeek("2026-11-22")).toBe(7);
    expect(weekStartIso("2026-11-22")).toBe("2026-11-16");
    expect(weekStartIso("2026-11-23")).toBe("2026-11-23");
  });
  it("across a month, a year and a DST change", () => {
    expect(weekStartIso("2026-11-01")).toBe("2026-10-26"); // Sunday 1.11
    expect(weekStartIso("2027-01-01")).toBe("2026-12-28");
    expect(weekStartIso("2026-10-25")).toBe("2026-10-19"); // DST ends on 25.10.2026
    expect(addDaysIso("2026-10-24", 2)).toBe("2026-10-26");
    expect(addDaysIso("2026-03-28", 2)).toBe("2026-03-30"); // DST starts on 29.03.2026
  });
  it("the result is always a Monday (all days of 2026)", () => {
    for (let d = "2026-01-01"; d <= "2026-12-31"; d = addDaysIso(d, 1)) expect(isoDayOfWeek(weekStartIso(d))).toBe(1);
  });
});

describe("month helpers", () => {
  it("month start and the days elapsed", () => {
    expect(monthStartIso("2026-11-22")).toBe("2026-11-01");
    const days = monthDatesUpTo("2026-11-22");
    expect(days).toHaveLength(22);
    expect(days[0]).toBe("2026-11-01");
    expect(days[21]).toBe("2026-11-22");
  });
  it("weeks of November 2026 up to the 22nd are Mondays (26.10, 2.11, 9.11, 16.11) — not Sundays", () => {
    expect(weekStartsOfMonthUpTo("2026-11-22")).toEqual(["2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16"]);
  });
});

describe("labels", () => {
  it("ISO week number and Polish day label", () => {
    expect(isoWeekNumber("2026-11-16")).toBe(47);
    expect(isoWeekNumber("2026-11-22")).toBe(47);
    expect(isoWeekNumber("2027-01-01")).toBe(53);
    expect(formatDayMonthPl("2026-11-16")).toBe("16 listopada");
  });
  it("rejects a malformed date", () => {
    expect(() => addDaysIso("2026-11-2", 1)).toThrow();
  });
});
