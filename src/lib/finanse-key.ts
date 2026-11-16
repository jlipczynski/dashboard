// One identity for a transaction, shared by "→ N podobnych" and by rules.
// Transfers are identified by recipient + title together (both must match);
// card / BLIK / standing-order purchases by the shop name.
// Pure — used by the /finanse page, the import route and scripts.

import { extractMerchant } from "./finanse-merchant";
import { classifyIntermediary } from "./finanse-intermediaries";
import { isCashHash } from "./finanse-similar";

export type TxKind = "cash" | "opaque" | "transfer" | "purchase";

export type KeyTx = {
  description: string;
  counterparty: string | null;
  merchant?: string | null;
  importHash?: string | null; // import row: importHash; saved row: import_hash
};

export const KEY_MAX = 60;

/**
 * UPPERCASE; drops `ref:…`, masked card numbers (557519******8847) and every run of digits
 * (incl. . , / - between digits — amounts, dates, order numbers) and punctuation left standing alone;
 * collapses spaces. No length cap.
 */
export function normalizeText(s: string | null | undefined): string {
  return (s ?? "")
    .toUpperCase()
    .replace(/REF:\S+/g, " ")
    .replace(/\d+\*+\d+/g, " ")
    .replace(/\d+(?:[.,/-]\d+)*/g, " ")
    // punctuation left alone after a removed number ("30.04." → ".") — drop it
    .replace(/(^|\s)[.,/:;-]+(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** normalizeText capped at 60 characters — for stored keys / rule patterns. */
export function normalizeKeyText(s: string | null | undefined): string {
  return normalizeText(s).slice(0, KEY_MAX).trim();
}

// Card payment in any currency ("… PŁATNOŚĆ KARTĄ 264.00 EUR SHOP CITY"); extractMerchant knows only PLN.
const CARD_ANY_CURRENCY = /PŁATNOŚĆ KARTĄ [\d,.]+ [A-Z]{3} (.+)/;

function purchaseMerchant(tx: KeyTx): string | null {
  const card = tx.description.match(CARD_ANY_CURRENCY);
  if (card) return card[1].trim();
  const extracted = extractMerchant(tx.description);
  return extracted !== tx.description ? extracted : null;
}

function rawMerchant(tx: KeyTx): string {
  return (tx.merchant && tx.merchant.trim()) || purchaseMerchant(tx) || tx.description;
}

export function txKind(tx: KeyTx): TxKind {
  if (isCashHash(tx.importHash)) return "cash";
  if (classifyIntermediary(tx.description, tx.counterparty, rawMerchant(tx)).kind === "opaque") return "opaque";
  if (purchaseMerchant(tx)) return "purchase";
  if (tx.counterparty && tx.counterparty.trim()) return "transfer";
  // No payee at all (bank fees etc.): the description itself is the "shop".
  return "purchase";
}

export function txIdentity(tx: KeyTx): { recipient: string | null; title: string | null; merchant: string | null } {
  const kind = txKind(tx);
  if (kind === "transfer") {
    return { recipient: normalizeKeyText(tx.counterparty) || null, title: normalizeKeyText(tx.description) || null, merchant: null };
  }
  if (kind === "purchase") {
    const raw = purchaseMerchant(tx) ?? rawMerchant(tx);
    const clean = classifyIntermediary(tx.description, tx.counterparty, raw).cleanMerchant;
    return { recipient: null, title: null, merchant: normalizeKeyText(clean) || null };
  }
  return { recipient: null, title: null, merchant: null };
}

/**
 * cash / opaque → null (never "similar");
 * transfer → `T|recipient|title` (both must be equal);
 * purchase → `M|first word of the shop name with ≥ 3 characters`.
 */
export function similarityKey(tx: KeyTx): string | null {
  const kind = txKind(tx);
  const id = txIdentity(tx);
  if (kind === "transfer") return id.recipient && id.title ? `T|${id.recipient}|${id.title}` : null;
  if (kind === "purchase" && id.merchant) {
    const word = id.merchant.split(/[\s/\-_]+/).find((w) => w.length >= 3);
    return word ? `M|${word}` : null;
  }
  return null;
}
