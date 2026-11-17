// Matching an Erste e-mail alert with a bank-CSV row (brief Finanse 08, tightened after Jan's review).
// Amount + date ±3 days alone is NOT enough to merge automatically. A pair is merged only with
// identifying evidence; anything ambiguous goes to manual review.
//
// Candidate (necessary): same amount to the grosz (same sign), date within ±3 days, and no
// contradicting identifier (different balance-after, different card).
// Automatic merge (sufficient), only when the pair is unique in BOTH directions:
//   • "saldo"          — balance after the operation is equal (both known), or
//   • "odbiorca+tytuł" — payee AND title match (normalized; one contains the other), or
//   • "karta+sklep"    — same card (last 4 digits) AND the shop name appears on the other side.
// Otherwise, if there are candidates → "review" (nothing merged); no candidates → "insert".
// Pure: the API routes load rows and apply the plan.

import { normalizeText } from "./finanse-key";

export const MATCH_WINDOW_DAYS = 3;

export type MatchRow = {
  date: string; // YYYY-MM-DD
  amountGrosze: number; // signed
  balanceGrosze?: number | null; // balance after the operation
  counterparty?: string | null;
  title?: string | null; // e-mail "Tytuł" / CSV description
  cardLast4?: string | null;
};
export type CandidateRow = MatchRow & { id: string };

export type MatchBasis = "saldo" | "odbiorca+tytuł" | "karta+sklep";

export type MatchDecision =
  | { action: "update"; emailId: string; basis: MatchBasis } // identified → merge
  | { action: "insert" } // no candidate
  | { action: "review"; emailIds: string[]; reason: string }; // ambiguous → manual verification

const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

export function withinWindow(a: string, b: string, days = MATCH_WINDOW_DAYS): boolean {
  return Math.abs(dayNumber(a) - dayNumber(b)) <= days;
}

/** Last 4 digits of a masked card number in a text ("557519******8847" / "****8847" → "8847"), or null. */
export function cardLast4(text: string | null | undefined): string | null {
  return text?.match(/(?:\d{4,6})?\*{2,}(\d{4})/)?.[1] ?? null;
}

const textMatch = (a: string | null | undefined, b: string | null | undefined): boolean => {
  const x = normalizeText(a);
  const y = normalizeText(b);
  if (x.length < 3 || y.length < 3) return false;
  return x === y || x.includes(y) || y.includes(x);
};

type Evidence = { candidate: boolean; basis: MatchBasis | null };

/** Is `e` a possible counterpart of `c`, and is there identifying evidence? */
export function evidence(c: MatchRow, e: MatchRow): Evidence {
  const none = { candidate: false, basis: null };
  if (c.amountGrosze !== e.amountGrosze || !withinWindow(c.date, e.date)) return none;
  const bothBalance = c.balanceGrosze != null && e.balanceGrosze != null;
  if (bothBalance && c.balanceGrosze !== e.balanceGrosze) return none; // contradiction: different account state
  if (c.cardLast4 && e.cardLast4 && c.cardLast4 !== e.cardLast4) return none; // different card
  if (bothBalance) return { candidate: true, basis: "saldo" };
  if (textMatch(c.counterparty, e.counterparty) && textMatch(c.title, e.title)) return { candidate: true, basis: "odbiorca+tytuł" };
  // Card payment: the e-mail names the shop ("Gdzie"), the CSV has it inside the description.
  const shop = textMatch(c.counterparty, e.title) || textMatch(c.title, e.counterparty);
  if (c.cardLast4 && e.cardLast4 && c.cardLast4 === e.cardLast4 && shop) return { candidate: true, basis: "karta+sklep" };
  return { candidate: true, basis: null };
}

/**
 * One decision per new row. A merge needs evidence AND uniqueness both ways: the new row has exactly
 * one identified counterpart, and that counterpart is not identified by any other new row.
 */
export function planEmailMatches(newRows: MatchRow[], existing: CandidateRow[]): MatchDecision[] {
  const ev = newRows.map((n) => existing.map((e) => ({ e, ...evidence(n, e) })).filter((x) => x.candidate));
  const strongUse = new Map<string, number>();
  for (const list of ev) for (const x of list) if (x.basis) strongUse.set(x.e.id, (strongUse.get(x.e.id) ?? 0) + 1);

  return ev.map((list) => {
    if (list.length === 0) return { action: "insert" };
    const strong = list.filter((x) => x.basis);
    if (strong.length === 1 && strongUse.get(strong[0].e.id) === 1) {
      return { action: "update", emailId: strong[0].e.id, basis: strong[0].basis! };
    }
    const reason =
      strong.length > 1
        ? "kilka operacji pasuje równie dobrze"
        : strong.length === 1
          ? "ta sama operacja pasuje do kilku pozycji"
          : "zgadza się tylko kwota i data — brak salda, odbiorcy lub tytułu";
    return { action: "review", emailIds: list.map((x) => x.e.id), reason };
  });
}

export const DUPLICATE_NOTE = "możliwy duplikat e-mail/CSV";

// ── Classifying parsed alerts against rows already in the DB (import + dry-run use the same code) ──

export type AlertForMatch = {
  messageId: string;
  date: string;
  amountGrosze: number;
  balanceGrosze: number | null;
  counterparty: string | null;
  title: string;
  cardLast4?: string | null;
};

export type AlertClassification = {
  duplicates: { messageId: string; transactionId: string; basis: MatchBasis }[]; // same operation already in the DB
  uncertain: { messageId: string; candidateIds: string[]; reason: string }[]; // manual review, nothing written
  fresh: string[]; // no counterpart → would be inserted
};

/** existing: bank rows (CSV / older imports, incl. trash), never e-mail or cash rows. */
export function classifyAlerts(alerts: AlertForMatch[], existing: CandidateRow[]): AlertClassification {
  const plan = planEmailMatches(
    alerts.map((a) => ({
      date: a.date,
      amountGrosze: a.amountGrosze,
      balanceGrosze: a.balanceGrosze,
      counterparty: a.counterparty,
      title: a.title,
      cardLast4: a.cardLast4 ?? cardLast4(a.title),
    })),
    existing
  );
  const out: AlertClassification = { duplicates: [], uncertain: [], fresh: [] };
  plan.forEach((d, i) => {
    const id = alerts[i].messageId;
    if (d.action === "update") out.duplicates.push({ messageId: id, transactionId: d.emailId, basis: d.basis });
    else if (d.action === "review") out.uncertain.push({ messageId: id, candidateIds: d.emailIds, reason: d.reason });
    else out.fresh.push(id);
  });
  return out;
}

export const toGrosze = (v: number | string) => Math.round(Number(v) * 100);
