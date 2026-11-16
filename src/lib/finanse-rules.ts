// Categorization rules: matching (import), building from a transaction and validation (save).
// Pure — shared by the import route, the rules API, the /finanse page and scripts.

import { normalizeKeyText, normalizeText, txIdentity, txKind, type KeyTx } from "./finanse-key";

export type RuleLike = {
  pattern: string;
  counterparty_pattern?: string | null;
  created_at?: string | null;
};

/** Patterns that would catch unrelated transactions when used without a recipient. */
const TOO_GENERAL_RAW = [
  "PRZELEW", "PRZELEW NA TELEFON", "PRZELEW ŚRODKÓW", "PRZELEW SRODKOW",
  "WPŁATA", "WPLATA", "WYPŁATA", "WYPLATA", "ZWROT",
  "GOTÓWKA:", "GOTOWKA:", "JAN", "DOP.", "OPŁATA", "OPLATA", "PŁATNOŚĆ KARTĄ", "PLATNOSC KARTA",
];
export const TOO_GENERAL = new Set(TOO_GENERAL_RAW.map(normalizeKeyText));
export const TOO_GENERAL_MESSAGE = "Za ogólna reguła — złapałaby niezwiązane transakcje.";
export const MIN_PATTERN = 4;

/** null = OK; otherwise the message for Jan. Expects normalized values (see ruleFromTx / normalizeRule). */
export function validateRule(pattern: string, counterpartyPattern: string | null): string | null {
  if (!pattern) return TOO_GENERAL_MESSAGE;
  if (counterpartyPattern) return null; // recipient + title together are specific enough
  if (pattern.length < MIN_PATTERN || TOO_GENERAL.has(pattern)) return TOO_GENERAL_MESSAGE;
  return null;
}

export function normalizeRule(pattern: string, counterpartyPattern?: string | null) {
  return { pattern: normalizeKeyText(pattern), counterparty_pattern: normalizeKeyText(counterpartyPattern) || null };
}

/** transfer → title + recipient; purchase → full shop name; cash / opaque → null (no rule). */
export function ruleFromTx(tx: KeyTx): { pattern: string; counterparty_pattern: string | null } | null {
  const kind = txKind(tx);
  const id = txIdentity(tx);
  if (kind === "transfer" && id.title && id.recipient) return { pattern: id.title, counterparty_pattern: id.recipient };
  if (kind === "purchase" && id.merchant) return { pattern: id.merchant, counterparty_pattern: null };
  return null;
}

/** "PATTERN + RECIPIENT" for display. */
export const ruleLabel = (r: { pattern: string; counterparty_pattern?: string | null }) =>
  r.counterparty_pattern ? `${r.pattern} + ${r.counterparty_pattern}` : r.pattern;

/** Most specific first: rules with a recipient, then longer patterns; ties by created_at (older first). */
export function sortRules<T extends RuleLike>(rules: T[]): T[] {
  return [...rules].sort((a, b) => {
    const ca = a.counterparty_pattern ? 1 : 0;
    const cb = b.counterparty_pattern ? 1 : 0;
    if (ca !== cb) return cb - ca;
    const la = normalizeKeyText(a.pattern).length;
    const lb = normalizeKeyText(b.pattern).length;
    if (la !== lb) return lb - la;
    return (a.created_at ?? "").localeCompare(b.created_at ?? "");
  });
}

/**
 * First matching rule from an already sorted list (sortRules).
 * - with counterparty_pattern: description+merchant contains the pattern AND the counterparty contains the recipient;
 * - without: description+merchant+counterparty contains the pattern (as before — recipient-only rules keep working).
 * Both sides are normalized the same way (no digits, uppercase).
 */
export function matchRule<T extends RuleLike>(
  sortedRules: T[],
  tx: { description: string; merchant?: string | null; counterparty: string | null }
): T | null {
  const text = normalizeText(`${tx.description} ${tx.merchant ?? ""}`);
  const cp = normalizeText(tx.counterparty);
  const all = `${text} ${cp}`;
  for (const r of sortedRules) {
    const p = normalizeKeyText(r.pattern);
    if (!p) continue; // a pattern of only digits would match everything
    const rc = normalizeKeyText(r.counterparty_pattern);
    if (rc) {
      if (text.includes(p) && cp.includes(rc)) return r;
    } else if (all.includes(p)) {
      return r;
    }
  }
  return null;
}
