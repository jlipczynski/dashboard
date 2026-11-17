import { describe, it, expect } from "vitest";
import { planEmailMatches, withinWindow, toGrosze } from "../lib/finanse-email-match";

const email = (id: string, date: string, amountGrosze: number) => ({ id, date, amountGrosze });

describe("planEmailMatches", () => {
  it("exactly one candidate (same amount, ±3 days) → update it", () => {
    expect(planEmailMatches([{ date: "2026-11-18", amountGrosze: -980 }], [email("e1", "2026-11-17", -980)])).toEqual([
      { action: "update", emailId: "e1" },
    ]);
  });

  it("no candidate: different amount or more than 3 days apart → insert", () => {
    const emails = [email("e1", "2026-11-17", -981), email("e2", "2026-11-10", -980)];
    expect(planEmailMatches([{ date: "2026-11-17", amountGrosze: -980 }], emails)).toEqual([{ action: "insert" }]);
  });

  it("several candidates → insert and flag them", () => {
    const emails = [email("e1", "2026-11-16", -980), email("e2", "2026-11-18", -980)];
    expect(planEmailMatches([{ date: "2026-11-17", amountGrosze: -980 }], emails)).toEqual([
      { action: "insert_flag", emailIds: ["e1", "e2"] },
    ]);
  });

  it("an e-mail row is matched at most once: two identical CSV payments, one e-mail → update + insert", () => {
    const csv = [
      { date: "2026-11-17", amountGrosze: -500 },
      { date: "2026-11-17", amountGrosze: -500 },
    ];
    expect(planEmailMatches(csv, [email("e1", "2026-11-17", -500)])).toEqual([
      { action: "update", emailId: "e1" },
      { action: "insert" },
    ]);
  });

  it("sign matters: a credit never matches a debit", () => {
    expect(planEmailMatches([{ date: "2026-11-17", amountGrosze: 980 }], [email("e1", "2026-11-17", -980)])).toEqual([
      { action: "insert" },
    ]);
  });
});

describe("helpers", () => {
  it("withinWindow is inclusive at 3 days and crosses month ends", () => {
    expect(withinWindow("2026-11-30", "2026-12-03")).toBe(true);
    expect(withinWindow("2026-11-30", "2026-12-04")).toBe(false);
  });
  it("toGrosze avoids float drift", () => {
    expect(toGrosze("-9.80")).toBe(-980);
    expect(toGrosze(0.1 + 0.2)).toBe(30);
  });
});
