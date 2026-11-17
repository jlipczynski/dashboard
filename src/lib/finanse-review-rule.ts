// Review page (/finanse/przeglad): "Zapamiętaj dla <odbiorca>" after a category change.
// Same rule shape and validation as "Zapamiętaj" in Historia (ruleFromTx + validateRule). Pure.

import { ruleFromTx, validateRule } from "./finanse-rules";

export type ReviewRuleTx = {
  description: string | null;
  counterparty: string | null;
  merchant: string | null;
  import_hash: string | null;
  category_id: string | null;
  subcategory_id: string | null;
};

export const NO_RULE_MESSAGE = "Dla tej transakcji nie da się zapisać reguły";

export type ReviewRule =
  | { kind: "none" } // category/subcategory unchanged (or no category) → nothing to remember
  | { kind: "invalid"; message: string } // changed, but no safe rule (too general, cash, payment intermediary)
  | { kind: "ok"; pattern: string; counterparty_pattern: string | null; target: string };

/** Rule to offer for a reviewed transaction, given the category/subcategory chosen on the card. */
export function reviewRule(tx: ReviewRuleTx, categoryId: string | null, subcategoryId: string | null): ReviewRule {
  const changed = (categoryId ?? null) !== (tx.category_id ?? null) || (subcategoryId ?? null) !== (tx.subcategory_id ?? null);
  if (!changed || !categoryId) return { kind: "none" };
  const rule = ruleFromTx({
    description: tx.description ?? "",
    counterparty: tx.counterparty,
    merchant: tx.merchant,
    importHash: tx.import_hash,
  });
  if (!rule) return { kind: "invalid", message: NO_RULE_MESSAGE };
  const error = validateRule(rule.pattern, rule.counterparty_pattern);
  if (error) return { kind: "invalid", message: error };
  return { ...rule, kind: "ok", target: rule.counterparty_pattern ?? rule.pattern };
}

/**
 * State of the "Zapamiętaj" checkbox: an explicit click wins; otherwise ON, except for one-off
 * transactions (a one-off purchase should not become a rule). Toggling "Jednorazowy" clears the
 * explicit choice, so checking it unticks "Zapamiętaj" and Jan can tick it back by hand.
 */
export function rememberChecked(explicit: boolean | undefined, oneOff: boolean): boolean {
  return explicit ?? !oneOff;
}
