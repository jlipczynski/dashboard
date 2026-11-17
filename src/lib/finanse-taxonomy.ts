// /finanse/kategorie — pure taxonomy logic: validation, delete guard, merge plan, ordering.
// No DB: the API route loads data and calls these; the merge itself runs as one SQL function
// (migration 026) so it either fully happens or not at all.

export const CATEGORY_TYPES = ["expense", "income", "transfer"] as const;
export type CategoryType = (typeof CATEGORY_TYPES)[number];
export const KINDS = ["fixed", "essential", "discretionary"] as const;
export type Kind = (typeof KINDS)[number];

/** Ready-made colours for the picker (the current categories use these hues). */
export const CATEGORY_COLORS = [
  "#E08A4F", "#4C86CF", "#4FA673", "#C25E9B", "#D06262",
  "#7E68C9", "#3C9198", "#D19A2A", "#9B7A52", "#6A7B87",
] as const;

const NAME_MAX = 60;
const HEX = /^#[0-9A-Fa-f]{6}$/;

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export type CategoryPatch = Partial<{ name: string; type: CategoryType; icon: string; color: string; sort_order: number }>;
export type SubcategoryPatch = Partial<{ name: string; kind: Kind | null; category_id: string }>;

function cleanName(v: unknown): Result<string> {
  if (typeof v !== "string") return { ok: false, error: "Nazwa musi być tekstem" };
  const name = v.trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Nazwa nie może być pusta" };
  if (name.length > NAME_MAX) return { ok: false, error: `Nazwa może mieć najwyżej ${NAME_MAX} znaków` };
  return { ok: true, value: name };
}

/** Only known fields with valid values; unknown fields are ignored. Empty patch → error. */
export function validateCategoryPatch(input: Record<string, unknown>, allowedIcons: readonly string[]): Result<CategoryPatch> {
  const out: CategoryPatch = {};
  if ("name" in input) {
    const n = cleanName(input.name);
    if (!n.ok) return n;
    out.name = n.value;
  }
  if ("type" in input) {
    if (!CATEGORY_TYPES.includes(input.type as CategoryType)) return { ok: false, error: "Nieznany typ kategorii" };
    out.type = input.type as CategoryType;
  }
  if ("icon" in input) {
    if (typeof input.icon !== "string" || !allowedIcons.includes(input.icon)) return { ok: false, error: "Nieznana ikona" };
    out.icon = input.icon;
  }
  if ("color" in input) {
    if (typeof input.color !== "string" || !HEX.test(input.color)) return { ok: false, error: "Kolor musi mieć postać #RRGGBB" };
    out.color = input.color.toUpperCase();
  }
  if ("sort_order" in input) {
    if (!Number.isInteger(input.sort_order)) return { ok: false, error: "Kolejność musi być liczbą całkowitą" };
    out.sort_order = input.sort_order as number;
  }
  if (Object.keys(out).length === 0) return { ok: false, error: "Nic do zmiany" };
  return { ok: true, value: out };
}

export function validateSubcategoryPatch(input: Record<string, unknown>): Result<SubcategoryPatch> {
  const out: SubcategoryPatch = {};
  if ("name" in input) {
    const n = cleanName(input.name);
    if (!n.ok) return n;
    out.name = n.value;
  }
  if ("kind" in input) {
    if (input.kind !== null && !KINDS.includes(input.kind as Kind)) return { ok: false, error: "Nieznany rodzaj" };
    out.kind = input.kind as Kind | null;
  }
  if ("category_id" in input) {
    if (typeof input.category_id !== "string" || !input.category_id) return { ok: false, error: "Brak kategorii docelowej" };
    out.category_id = input.category_id;
  }
  if (Object.keys(out).length === 0) return { ok: false, error: "Nic do zmiany" };
  return { ok: true, value: out };
}

export type UsageCounts = { transactions: number; trashed: number; rules: number; subcategories?: number };

/** Delete only when nothing refers to the item (incl. transactions in the trash). */
export function deleteGuard(c: UsageCounts): { ok: true } | { ok: false; reason: string } {
  const parts: string[] = [];
  if (c.transactions + c.trashed > 0) parts.push(`${c.transactions + c.trashed} transakcji${c.trashed ? ` (w tym ${c.trashed} w koszu)` : ""}`);
  if (c.rules > 0) parts.push(`${c.rules} reguł`);
  if ((c.subcategories ?? 0) > 0) parts.push(`${c.subcategories} podkategorii`);
  if (parts.length === 0) return { ok: true };
  return { ok: false, reason: `Ma ${parts.join(", ")} — najpierw scal` };
}

export type MergeItem = { id: string; name: string; category_id?: string };

/** Checks a merge X → Y and builds the confirmation text ("Przeniosę N transakcji i M reguł"). */
export function mergePlan(
  entity: "category" | "subcategory",
  from: MergeItem | undefined,
  to: MergeItem | undefined,
  counts: UsageCounts
): Result<{ summary: string; counts: UsageCounts }> {
  if (!from || !to) return { ok: false, error: "Nie znaleziono pozycji do scalenia" };
  if (from.id === to.id) return { ok: false, error: "Nie można scalić pozycji z samą sobą" };
  const tx = counts.transactions + counts.trashed;
  const what = entity === "category" ? "kategorię" : "podkategorię";
  let summary = `Przeniosę ${tx} transakcji${counts.trashed ? ` (w tym ${counts.trashed} w koszu)` : ""} i ${counts.rules} reguł`;
  if (entity === "category" && (counts.subcategories ?? 0) > 0) summary += ` oraz ${counts.subcategories} podkategorii`;
  summary += ` z „${from.name}” do „${to.name}”, potem usunę ${what} „${from.name}”.`;
  return { ok: true, value: { summary, counts } };
}

/** Swaps an item with its neighbour; returns the new sort_order for every item of the list (10, 20, …). */
export function reorder<T extends { id: string; sort_order: number; name: string }>(
  items: T[],
  id: string,
  dir: "up" | "down"
): { id: string; sort_order: number }[] {
  const list = [...items].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "pl"));
  const i = list.findIndex((x) => x.id === id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i >= 0 && j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]];
  return list.map((x, k) => ({ id: x.id, sort_order: (k + 1) * 10 }));
}
