// Regression: no fake data. Garmin is unverified → never pre-filled or saved as "measured"; an error or an empty /
// truncated list gives "brak danych" (null), never 0. Incomplete sources (e.g. calories logged 3/7 days) are hints only.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { garminSuggestion, GARMIN_LIST_LIMIT, SOURCE_LABEL } from "../lib/wig-model";
import { ResultRow } from "../components/wig/LeadEditors";
import type { LeadT } from "../components/wig/client";

const W = "2026-11-23";
describe("garminSuggestion", () => {
  it("API error → null with the reason (not 0)", () => {
    const s = garminSuggestion({ status: "error", message: "Garmin sync failed: 401" }, "garmin_strength", W);
    expect(s.value).toBeNull();
    expect(s.evidence).toMatch(/niedostępny.*wpisz ręcznie/);
  });
  it("empty list → null (can't tell 0 from missing data)", () => {
    expect(garminSuggestion({ status: "ok", activities: [] }, "garmin_strength", W).value).toBeNull();
  });
  it("truncated list that does not reach the week start → null", () => {
    const acts = Array.from({ length: GARMIN_LIST_LIMIT }, (_, i) => ({ type: "running", date: `2026-11-2${(i % 3) + 6} 07:00:00` }));
    expect(garminSuggestion({ status: "ok", activities: acts }, "garmin_strength", W).value).toBeNull();
  });
  it("valid list → count, but always marked unverified (complete=false)", () => {
    const acts = [
      { type: "strength_training", date: "2026-11-24 18:00:00" },
      { type: "indoor_cardio", date: "2026-11-27 18:00:00" },
      { type: "running", date: "2026-11-25 07:00:00" },
      { type: "strength_training", date: "2026-11-20 18:00:00" }, // previous week
    ];
    const s = garminSuggestion({ status: "ok", activities: acts }, "garmin_strength", W);
    expect(s.value).toBe(2);
    expect(s.complete).toBe(false);
    expect(s.evidence).toMatch(/niezweryfikowane/);
  });
  it("source labels say 'do sprawdzenia'", () => {
    expect(SOURCE_LABEL.garmin_strength).toMatch(/do sprawdzenia/);
    expect(SOURCE_LABEL.garmin_cycling).toMatch(/do sprawdzenia/);
    expect(SOURCE_LABEL.garmin_running).toMatch(/do sprawdzenia/);
  });
});

const lead = (o: Partial<LeadT>): LeadT => ({ id: "l1", weekStart: W, area: "zdrowie", leadKey: "silownia", name: "Siłownia", unit: "treningi", direction: "at_least", target: 2, targetMax: null, weight: 100, source: "garmin_strength", notes: "", position: 0, result: null, tasks: [], ...o });

describe("ResultRow never pre-fills an unverified or incomplete source", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it("Garmin count is shown as a hint, the field stays empty; saving what Jan types is 'manual', not 'measured'", async () => {
    const calls: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => { calls.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify({ status: "ok" }), { status: 200 }); }));
    render(<ResultRow lead={lead({})} suggestion={{ value: 2, evidence: "Garmin podaje 2 — źródło niezweryfikowane, sprawdź i wpisz sam", complete: false }} closed={false} onSaved={() => {}} onError={() => {}} />);
    const input = screen.getByRole("textbox", { name: "Wykonanie: Siłownia" }) as HTMLInputElement;
    expect(input.value).toBe("");
    expect(screen.getByText(/do sprawdzenia — nie wpisano automatycznie/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Zapisz wykonanie" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Zapisz wykonanie" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ action: "save_result", status: "manual", actual: 2 });
  });
  it("calories logged 3/7 days: sum is not pre-filled (would look like 'under the limit')", () => {
    render(<ResultRow lead={lead({ name: "Kalorie", unit: "kcal", direction: "at_most", target: 14000, source: "calories_week" })} suggestion={{ value: 6000, evidence: "nutrition_log: 6000 kcal, zalogowane dni 3/7", complete: false }} closed={false} onSaved={() => {}} onError={() => {}} />);
    expect((screen.getByRole("textbox", { name: "Wykonanie: Kalorie" }) as HTMLInputElement).value).toBe("");
  });
  it("complete, verified source (rehab_entries for the whole week) is pre-filled and saved as 'measured'", () => {
    render(<ResultRow lead={lead({ name: "Rehabilitacja", unit: "dni", target: 6, source: "rehab_days" })} suggestion={{ value: 5, evidence: "rehab_entries: 5 dni", complete: true }} closed={false} onSaved={() => {}} onError={() => {}} />);
    expect((screen.getByRole("textbox", { name: "Wykonanie: Rehabilitacja" }) as HTMLInputElement).value).toBe("5");
  });
});
