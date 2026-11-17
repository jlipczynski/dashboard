// Brief Finanse 10: the coach's knowledge about Jan (finance_coach_insights). Pure — no DB.
// Nothing becomes knowledge without Jan: the coach / analysis only PROPOSE; Jan accepts, rejects,
// edits or retires. Every decision is a status change with decided_at.

export const INSIGHT_KINDS = ["decision", "rule", "fact", "pattern", "lesson"] as const;
export type InsightKind = (typeof INSIGHT_KINDS)[number];
export type InsightStatus = "proposed" | "accepted" | "rejected" | "retired";

export const KIND_LABEL: Record<InsightKind, string> = {
  decision: "Decyzje",
  rule: "Zasady",
  fact: "Fakty",
  pattern: "Wzorce",
  lesson: "Lekcje",
};

export const STATUSES: InsightStatus[] = ["proposed", "accepted", "rejected", "retired"];
export const MAX_TEXT = 500;

export type InsightAction = "accept" | "reject" | "retire" | "edit";

/** Which status an action may start from, and where it leads. */
const TRANSITIONS: Record<Exclude<InsightAction, "edit">, { from: InsightStatus[]; to: InsightStatus }> = {
  accept: { from: ["proposed"], to: "accepted" },
  reject: { from: ["proposed"], to: "rejected" },
  retire: { from: ["accepted"], to: "retired" },
};

export function validateInsightPatch(input: Record<string, unknown>):
  | { ok: true; value: { id: string; action: InsightAction; text?: string } }
  | { ok: false; error: string } {
  const id = input.id;
  if (typeof id !== "string" || !id) return { ok: false, error: "Brak id wpisu" };
  const action = input.action;
  if (action !== "accept" && action !== "reject" && action !== "retire" && action !== "edit") return { ok: false, error: "Nieznana akcja" };
  if (action === "edit" || input.text !== undefined) {
    const text = typeof input.text === "string" ? input.text.trim() : "";
    if (!text) return { ok: false, error: "Treść nie może być pusta" };
    if (text.length > MAX_TEXT) return { ok: false, error: `Treść może mieć najwyżej ${MAX_TEXT} znaków` };
    return { ok: true, value: { id, action, text } };
  }
  return { ok: true, value: { id, action } };
}

/**
 * The update for an insight in `current` status, or an error when the action is not allowed.
 * "edit" changes only the text (allowed for proposed and accepted entries); "accept" may carry an edited text
 * ("Popraw" = accept with Jan's wording).
 */
export function insightUpdate(
  current: InsightStatus,
  patch: { action: InsightAction; text?: string },
  now: string
): { ok: true; update: { status?: InsightStatus; decided_at?: string; text?: string } } | { ok: false; error: string } {
  if (patch.action === "edit") {
    if (current !== "proposed" && current !== "accepted") return { ok: false, error: "Tego wpisu nie można już edytować" };
    return { ok: true, update: { text: patch.text } };
  }
  const t = TRANSITIONS[patch.action];
  if (!t.from.includes(current)) return { ok: false, error: `Nie można: wpis ma status „${current}”` };
  return { ok: true, update: { status: t.to, decided_at: now, ...(patch.text ? { text: patch.text } : {}) } };
}

/** Accepted insights grouped by kind (in INSIGHT_KINDS order), newest first inside a group. */
export function groupByKind<T extends { kind: string; created_at: string }>(items: T[]): { kind: InsightKind; label: string; items: T[] }[] {
  return INSIGHT_KINDS.map((kind) => ({
    kind,
    label: KIND_LABEL[kind],
    items: items.filter((i) => i.kind === kind).sort((a, b) => b.created_at.localeCompare(a.created_at)),
  })).filter((g) => g.items.length > 0);
}
