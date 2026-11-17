import { describe, it, expect } from "vitest";
import { validateInsightPatch, insightUpdate, groupByKind, parseProposals, MAX_TEXT } from "../lib/finanse-insights";

const NOW = "2026-11-18T08:00:00.000Z";

describe("validateInsightPatch", () => {
  it("accepts the four actions; edit needs a non-empty text", () => {
    expect(validateInsightPatch({ id: "a", action: "accept" })).toEqual({ ok: true, value: { id: "a", action: "accept" } });
    expect(validateInsightPatch({ id: "a", action: "edit", text: "  nowa treść " })).toEqual({ ok: true, value: { id: "a", action: "edit", text: "nowa treść" } });
    expect(validateInsightPatch({ id: "a", action: "edit", text: "  " }).ok).toBe(false);
    expect(validateInsightPatch({ id: "a", action: "edit", text: "x".repeat(MAX_TEXT + 1) }).ok).toBe(false);
  });
  it("rejects a missing id or an unknown action", () => {
    expect(validateInsightPatch({ action: "accept" }).ok).toBe(false);
    expect(validateInsightPatch({ id: "a", action: "delete" }).ok).toBe(false);
  });
});

describe("insightUpdate — nothing becomes knowledge without Jan", () => {
  it("proposed → accepted / rejected, with decided_at", () => {
    expect(insightUpdate("proposed", { action: "accept" }, NOW)).toEqual({ ok: true, update: { status: "accepted", decided_at: NOW } });
    expect(insightUpdate("proposed", { action: "reject" }, NOW)).toEqual({ ok: true, update: { status: "rejected", decided_at: NOW } });
  });
  it("'Popraw': accept with Jan's wording", () => {
    expect(insightUpdate("proposed", { action: "accept", text: "Moja wersja" }, NOW)).toEqual({
      ok: true,
      update: { status: "accepted", decided_at: NOW, text: "Moja wersja" },
    });
  });
  it("accepted → retired; editing an accepted entry changes only the text", () => {
    expect(insightUpdate("accepted", { action: "retire" }, NOW)).toEqual({ ok: true, update: { status: "retired", decided_at: NOW } });
    expect(insightUpdate("accepted", { action: "edit", text: "poprawka" }, NOW)).toEqual({ ok: true, update: { text: "poprawka" } });
  });
  it("forbidden transitions", () => {
    expect(insightUpdate("accepted", { action: "accept" }, NOW).ok).toBe(false);
    expect(insightUpdate("proposed", { action: "retire" }, NOW).ok).toBe(false);
    expect(insightUpdate("rejected", { action: "accept" }, NOW).ok).toBe(false);
    expect(insightUpdate("retired", { action: "edit", text: "x" }, NOW).ok).toBe(false);
  });
});

it("groupByKind: decisions, rules, facts… newest first; empty groups dropped", () => {
  const g = groupByKind([
    { kind: "rule", created_at: "2026-11-17T10:00:00Z", text: "a" },
    { kind: "decision", created_at: "2026-11-17T09:00:00Z", text: "b" },
    { kind: "rule", created_at: "2026-11-18T10:00:00Z", text: "c" },
  ]);
  expect(g.map((x) => [x.label, x.items.map((i) => i.text)])).toEqual([
    ["Decyzje", ["b"]],
    ["Zasady", ["c", "a"]],
  ]);
});

describe("parseProposals — the coach may only propose, with evidence", () => {
  const ok = { kind: "pattern", text: "Restauracje: 19 transakcji w listopadzie, razem 1 093,34 zł.", evidence: { count: 19, total: 1093.34 } };
  it("0–2 well-formed entries, also inside a ```json block", () => {
    expect(parseProposals("[]")).toEqual([]);
    expect(parseProposals("```json\n" + JSON.stringify([ok]) + "\n```")).toEqual([ok]);
    expect(parseProposals(JSON.stringify([ok, { ...ok, text: "b" }, { ...ok, text: "c" }]))).toHaveLength(2);
  });
  it("drops entries without evidence, with an unknown kind (incl. lessons) or empty text", () => {
    expect(parseProposals(JSON.stringify([{ ...ok, evidence: {} }, { ...ok, kind: "lesson" }, { ...ok, text: " " }]))).toEqual([]);
  });
  it("drops what the coach already knows or Jan rejected (case/punctuation-insensitive)", () => {
    expect(parseProposals(JSON.stringify([ok]), ["restauracje 19 transakcji w listopadzie razem 1 093 34 zł"])).toEqual([]);
  });
  it("garbage → nothing", () => {
    expect(parseProposals("Nie mam propozycji.")).toEqual([]);
    expect(parseProposals('{"kind":"fact"}')).toEqual([]);
  });
});
