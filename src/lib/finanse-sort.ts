// Client-side sorting of the Historia / Kosz tables (pure — no React, no DB).

export type HistSortCol = "date" | "name" | "amount" | "category" | "tag" | "deleted";
export type SortDir = "asc" | "desc";

export type SortableTransaction = {
  date: string;
  created_at?: string | null;
  deleted_at?: string | null;
  description: string;
  merchant: string | null;
  amount: number;
  tag: string | null;
  finance_categories: { name: string } | null;
};

/** First click on a column: Data and Usunięto start descending, the rest ascending. */
export function defaultSortDir(col: HistSortCol): SortDir {
  return col === "date" || col === "deleted" ? "desc" : "asc";
}

const plCompare = (a: string, b: string) => a.localeCompare(b, "pl", { sensitivity: "base" });

/** Name shown in the table: merchant, falling back to the description. */
export function displayName(t: SortableTransaction): string {
  return (t.merchant && t.merchant.trim()) || t.description;
}

/** Empty values (no category / no tag) always go last, regardless of direction. */
function compareNullableText(a: string | null, b: string | null, dir: SortDir): number {
  const ea = !a || !a.trim();
  const eb = !b || !b.trim();
  if (ea && eb) return 0;
  if (ea) return 1;
  if (eb) return -1;
  const cmp = plCompare(a!, b!);
  return dir === "asc" ? cmp : -cmp;
}

function compareDates(a: SortableTransaction, b: SortableTransaction): number {
  const cmp = a.date.localeCompare(b.date);
  if (cmp !== 0) return cmp;
  return (a.created_at ?? "").localeCompare(b.created_at ?? "");
}

export function sortTransactions<T extends SortableTransaction>(list: T[], col: HistSortCol, dir: SortDir): T[] {
  const sign = dir === "asc" ? 1 : -1;
  const cmp = (a: T, b: T): number => {
    switch (col) {
      case "date":
        return sign * compareDates(a, b);
      case "deleted": {
        const c = (a.deleted_at ?? "").localeCompare(b.deleted_at ?? "");
        return sign * (c !== 0 ? c : compareDates(a, b));
      }
      case "name":
        return sign * plCompare(displayName(a), displayName(b));
      case "amount":
        // Signed value: ascending puts the biggest expenses (most negative) on top.
        return sign * (a.amount - b.amount);
      case "category":
        return compareNullableText(a.finance_categories?.name ?? null, b.finance_categories?.name ?? null, dir);
      case "tag":
        return compareNullableText(a.tag, b.tag, dir);
    }
  };
  // Array.prototype.sort is stable, so equal keys keep the API order (date desc).
  return [...list].sort(cmp);
}
