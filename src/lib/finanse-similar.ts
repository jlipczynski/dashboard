// "→ Zastosuj do N podobnych" preview: which rows are listed and which start checked.
// Pure — the page passes its rows in; nothing is saved here.

export type SimilarCandidate = {
  id: string;
  categoryId: string | null;
  /** Opaque intermediary (PayU, PayPro…): same name = different shops → never "similar". */
  opaque: boolean;
};

export type SimilarSelection = {
  /** Rows listed in the panel, in the input order (opaque rows removed). */
  ids: string[];
  /** Checked by default: no category yet, or already the target category. */
  selected: string[];
  /** Listed but unchecked: they already have a different category. */
  conflicting: string[];
};

export function similarSelection(candidates: SimilarCandidate[], targetCategoryId: string): SimilarSelection {
  const listed = candidates.filter((c) => !c.opaque);
  const selected: string[] = [];
  const conflicting: string[] = [];
  for (const c of listed) {
    if (!c.categoryId || c.categoryId === targetCategoryId) selected.push(c.id);
    else conflicting.push(c.id);
  }
  return { ids: listed.map((c) => c.id), selected, conflicting };
}
