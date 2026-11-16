import { describe, it, expect } from "vitest";
import { buildSuggestPrompt, parseSuggestResponse } from "../lib/finanse-suggest";

const CAT_A = "11111111-1111-1111-1111-111111111111";
const CAT_B = "22222222-2222-2222-2222-222222222222";
const valid = new Set([CAT_A, CAT_B]);

describe("parseSuggestResponse", () => {
  it("parses a correct answer", () => {
    const r = parseSuggestResponse(`[{"i": 1, "categoryId": "${CAT_A}"}, {"i": 2, "categoryId": "${CAT_B}"}]`, 2, valid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([...r.byIndex.entries()]).toEqual([[1, CAT_A], [2, CAT_B]]);
    expect(r.rejected).toBe(0);
  });

  it("accepts a ```json markdown fence and surrounding text", () => {
    const raw = "Oto wynik:\n```json\n[{\"i\": 1, \"categoryId\": \"" + CAT_B + "\"}]\n```";
    const r = parseSuggestResponse(raw, 1, valid);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.byIndex.get(1)).toBe(CAT_B);
  });

  it("reports a truncated answer as a parse error", () => {
    const raw = `[{"i": 1, "categoryId": "${CAT_A}"}, {"i": 2, "categ`;
    expect(parseSuggestResponse(raw, 2, valid)).toEqual({ ok: false });
  });

  it("reports non-JSON as a parse error", () => {
    expect(parseSuggestResponse("Nie wiem", 1, valid)).toEqual({ ok: false });
    expect(parseSuggestResponse("[to nie json]", 1, valid)).toEqual({ ok: false });
  });

  it("rejects out-of-range index, unknown category and repeated index", () => {
    const raw = JSON.stringify([
      { i: 1, categoryId: CAT_A },
      { i: 0, categoryId: CAT_A },
      { i: 4, categoryId: CAT_A },
      { i: 2, categoryId: "not-a-category" },
      { i: 1, categoryId: CAT_B },
      { i: "3", categoryId: CAT_A },
      { i: 3, categoryId: CAT_B },
    ]);
    const r = parseSuggestResponse(raw, 3, valid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([...r.byIndex.entries()]).toEqual([[1, CAT_A], [3, CAT_B]]);
    expect(r.rejected).toBe(5);
  });
});

describe("buildSuggestPrompt", () => {
  it("numbers transactions 1..N without keys", () => {
    const p = buildSuggestPrompt(
      [{ id: CAT_A, name: "Food & Drink", type: "expense" }],
      [
        { key: "a".repeat(32), amount: -12.5, merchant: "LIDL", counterparty: null },
        { key: "b".repeat(32), amount: 100, merchant: "Wpływ", counterparty: "Firma X" },
      ]
    );
    expect(p).toContain("1. -12.5 PLN | LIDL");
    expect(p).toContain("2. +100 PLN | Wpływ | Firma X");
    expect(p).not.toContain("a".repeat(32));
    expect(p).toContain(`${CAT_A} | Food & Drink (wydatek)`);
  });
});
