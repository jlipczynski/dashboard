// "→ Zastosuj do N podobnych" preview: which rows are listed and which start checked.
// Pure — the page passes its rows in; nothing is saved here.
//
// The link is shown only when there is a real decision to make, so a candidate is left out when:
// - it is an opaque intermediary (PayU, PayPro…: same name = different shops),
// - it is a cash entry ("Gotówka: …" — every cash entry would look alike),
// - it already has exactly the target category + subcategory + tag (nothing to change),
// - Jan already said "no" for it from this source (unchecked on apply, or "Anuluj").

export type SimilarCandidate = {
  id: string;
  categoryId: string | null;
  subcategoryId?: string | null;
  tag?: string | null;
  opaque: boolean;
  isCash?: boolean;
};

export type SimilarTarget = {
  categoryId: string;
  subcategoryId?: string | null;
  tag?: string | null;
};

export type SimilarSelection = {
  /** Rows listed in the panel, in the input order. */
  ids: string[];
  /** Checked by default: no category yet, or the target category (with a different subcategory/tag). */
  selected: string[];
  /** Listed but unchecked: they already have a different category. */
  conflicting: string[];
};

const norm = (v: string | null | undefined) => (v ?? "").trim() || null;

export function hasTarget(c: SimilarCandidate, t: SimilarTarget): boolean {
  return (
    norm(c.categoryId) === norm(t.categoryId) &&
    norm(c.subcategoryId) === norm(t.subcategoryId) &&
    norm(c.tag) === norm(t.tag)
  );
}

export function similarSelection(
  candidates: SimilarCandidate[],
  target: SimilarTarget,
  dismissed: ReadonlySet<string> = new Set()
): SimilarSelection {
  const listed = candidates.filter(
    (c) => !c.opaque && !c.isCash && !dismissed.has(c.id) && !hasTarget(c, target)
  );
  const selected: string[] = [];
  const conflicting: string[] = [];
  for (const c of listed) {
    if (!c.categoryId || c.categoryId === target.categoryId) selected.push(c.id);
    else conflicting.push(c.id);
  }
  return { ids: listed.map((c) => c.id), selected, conflicting };
}

/** Cash entries from /wydatek: import_hash "cash:<uuid>". */
export const isCashHash = (importHash: string | null | undefined) => !!importHash?.startsWith("cash:");

// ── Remembered "no" decisions: localStorage { [sourceId]: string[] } ──
export const DISMISSED_STORAGE_KEY = "finanse.similarDismissed";
export type DismissedMap = Record<string, string[]>;

export function addDismissed(map: DismissedMap, sourceId: string, ids: string[]): DismissedMap {
  if (ids.length === 0) return map;
  const merged = new Set([...(map[sourceId] ?? []), ...ids]);
  return { ...map, [sourceId]: [...merged] };
}

export function parseDismissed(raw: string | null): DismissedMap {
  try {
    const v = JSON.parse(raw ?? "null");
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: DismissedMap = {};
    for (const [k, ids] of Object.entries(v)) {
      if (Array.isArray(ids)) out[k] = ids.filter((x): x is string => typeof x === "string");
    }
    return out;
  } catch {
    return {};
  }
}
