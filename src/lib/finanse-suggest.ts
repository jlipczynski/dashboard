// AI category suggestions for imported transactions, in batches.
// Transactions are numbered 1..N in the prompt (instead of 32-char hashes),
// which keeps the model's output ~3× shorter.

export const SUGGEST_BATCH_MAX = 40;

export type SuggestInput = {
  key: string;
  amount: number;
  merchant: string;
  counterparty: string | null;
};

export type SuggestCategory = { id: string; name: string; type: string };

/** How a category type is described to the model. */
export function categoryTypeLabel(type: string): string {
  if (type === "expense") return "wydatek";
  if (type === "transfer") return "przelew własny / oszczędności";
  return "przychód";
}

export function buildSuggestPrompt(categories: SuggestCategory[], txs: SuggestInput[]): string {
  const categoryList = categories
    .map((c) => `${c.id} | ${c.name} (${categoryTypeLabel(c.type)})`)
    .join("\n");
  const txList = txs
    .map(
      (t, i) =>
        `${i + 1}. ${t.amount > 0 ? "+" : ""}${t.amount} PLN | ${t.merchant}${t.counterparty ? ` | ${t.counterparty}` : ""}`
    )
    .join("\n");

  return `Przypisz każdą transakcję do najlepiej pasującej kategorii.

KATEGORIE (id | nazwa | typ):
${categoryList}

TRANSAKCJE (numer. kwota | merchant | kontrahent):
${txList}

Odpowiedz TYLKO w formacie JSON, tablica obiektów: [{"i": 1, "categoryId": "..."}]
"i" to numer transakcji z listy powyżej. Jeśli nie jesteś pewny, wybierz najbardziej pasującą. Nie pomijaj żadnej transakcji.`;
}

export type SuggestParseResult =
  | { ok: true; byIndex: Map<number, string>; rejected: number }
  | { ok: false };

/**
 * Parses the model's answer. Tolerates a ```json fence and text around the array.
 * A truncated / malformed array → { ok: false } (caller reports "parse").
 * Entries with an index outside 1..count, an unknown categoryId, or a repeated index
 * are counted as rejected and skipped.
 */
export function parseSuggestResponse(
  raw: string,
  count: number,
  validCategoryIds: Set<string>
): SuggestParseResult {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end <= start) return { ok: false };

  let data: unknown;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return { ok: false };
  }
  if (!Array.isArray(data)) return { ok: false };

  const byIndex = new Map<number, string>();
  let rejected = 0;
  for (const item of data) {
    const i = (item as { i?: unknown })?.i;
    const categoryId = (item as { categoryId?: unknown })?.categoryId;
    if (
      typeof i !== "number" ||
      !Number.isInteger(i) ||
      i < 1 ||
      i > count ||
      byIndex.has(i) ||
      typeof categoryId !== "string" ||
      !validCategoryIds.has(categoryId)
    ) {
      rejected++;
      continue;
    }
    byIndex.set(i, categoryId);
  }
  return { ok: true, byIndex, rejected };
}
