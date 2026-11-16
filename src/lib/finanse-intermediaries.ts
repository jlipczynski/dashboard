// Payment intermediaries: the bank shows the intermediary, not the shop.
//
// "opaque"   — bank statement names only the intermediary (PayU, PayPro, …);
//              the real shop has to be looked up (Gmail / web).
// "prefixed" — shop name follows an intermediary prefix ("PAYPAL *ZOOPLUS SE");
//              stripping the prefix is enough.
//
// To support a new intermediary, add one entry to the matching list below.

export type IntermediaryKind = "opaque" | "prefixed";

export type IntermediaryInfo = {
  kind: IntermediaryKind | null; // null = regular transaction
  provider: string | null; // e.g. "PayU", "PayPal"
  cleanMerchant: string; // merchant without the intermediary prefix
};

/** Group A — matched anywhere in description + counterparty (case-insensitive). */
const OPAQUE_PROVIDERS: { provider: string; re: RegExp }[] = [
  { provider: "PayU", re: /\bPAYU\b/i },
  { provider: "PayPro", re: /PAYPRO/i },
  { provider: "eService", re: /ESERVICE/i },
  { provider: "Autopay", re: /AUTOPAY/i },
  { provider: "Apple", re: /APPLE\.COM\/BILL/i },
  { provider: "Tpay", re: /\bTPAY\b/i },
  { provider: "Dotpay", re: /DOTPAY/i },
  { provider: "Blue Media", re: /BLUE ?MEDIA/i },
];

/** Group B — matched at the start of the merchant; the shop name follows. */
const PREFIXED_PROVIDERS: { provider: string; re: RegExp }[] = [
  { provider: "PeP", re: /^PeP\*\s*/i },
  { provider: "PP", re: /^PP\*\s*/i },
  { provider: "PayPal", re: /^PAYPAL \*\s*/i },
  { provider: "SumUp", re: /^SumUp \*\s*/i },
  { provider: "IdoPay", re: /^IdoPay \*\s*/i },
  { provider: "P24", re: /^P24\*\s*/i },
  { provider: "Square", re: /^SQ \*\s*/i },
  { provider: "ZTL", re: /^ZTL\*\s*/i },
];

/** Trailing reference number after a prefixed shop name, e.g. "ZOOPLUS SE 4029357733". */
const TRAILING_REF_RE = /\s+\d{8,}$/;

export function classifyIntermediary(
  description: string,
  counterparty: string | null,
  merchant: string
): IntermediaryInfo {
  const haystack = `${description} ${counterparty ?? ""}`;
  for (const { provider, re } of OPAQUE_PROVIDERS) {
    if (re.test(haystack)) return { kind: "opaque", provider, cleanMerchant: merchant };
  }

  for (const { provider, re } of PREFIXED_PROVIDERS) {
    if (re.test(merchant)) {
      const cleaned = merchant.replace(re, "").replace(TRAILING_REF_RE, "").trim();
      return { kind: "prefixed", provider, cleanMerchant: cleaned || merchant };
    }
  }

  return { kind: null, provider: null, cleanMerchant: merchant };
}
