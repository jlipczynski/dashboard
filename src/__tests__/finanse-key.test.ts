import { describe, it, expect } from "vitest";
import { normalizeKeyText, normalizeText, similarityKey, txKind, txIdentity } from "../lib/finanse-key";
import { matchRule, sortRules, validateRule, ruleFromTx, TOO_GENERAL_MESSAGE } from "../lib/finanse-rules";

const transfer = (description: string, counterparty: string) => ({ description, counterparty, merchant: description });
const card = (shop: string, amount = "12.97", currency = "PLN") => ({
  description: `DOP. MC 000000******0000 PŁATNOŚĆ KARTĄ ${amount} ${currency} ${shop}`,
  counterparty: null,
});

describe("similarityKey — transfers: recipient + title together", () => {
  it("same title, different recipient → different keys", () => {
    expect(similarityKey(transfer("Przelew na telefon", "Szymon Trener Siłownia"))).not.toBe(
      similarityKey(transfer("Przelew na telefon", "Anna Kubiak"))
    );
  });
  it("same title and recipient → same key", () => {
    const k = similarityKey(transfer("Przelew na telefon", "Anna Kubiak"));
    expect(k).toBe("T|ANNA KUBIAK|PRZELEW NA TELEFON");
    expect(similarityKey({ description: "Przelew na telefon", counterparty: "Anna Kubiak", merchant: null })).toBe(k);
  });
  it("same recipient, different title → different keys", () => {
    expect(similarityKey(transfer("Przelew", "Barbara Wróbel"))).not.toBe(
      similarityKey(transfer("Przelew na telefon", "Barbara Wróbel"))
    );
  });
});

describe("normalization", () => {
  it("bank fee: dates and masked card dropped → November and December share the title", () => {
    const nov = "Opł. za Pakiet bankomatowy od 01.11.2026 do 30.11.2026 dot.karty 000000******0000";
    const dec = "Opł. za Pakiet bankomatowy od 01.12.2026 do 31.12.2026 dot.karty 000000******0000";
    expect(normalizeKeyText(nov)).toBe(normalizeKeyText(dec));
    expect(normalizeKeyText(nov)).toBe("OPŁ. ZA PAKIET BANKOMATOWY OD DO DOT.KARTY");
    expect(similarityKey({ description: nov, counterparty: null })).toBe(similarityKey({ description: dec, counterparty: null }));
  });
  it("drops ref:, amounts, order numbers; caps keys at 60, not normalizeText", () => {
    expect(normalizeText("Zakup BLIK Allegro ref:ABC123 kwota 12,50 nr 1/2026-11")).toBe("ZAKUP BLIK ALLEGRO KWOTA NR");
    expect(normalizeKeyText("A".repeat(80))).toHaveLength(60);
    expect(normalizeText("A".repeat(80))).toHaveLength(80);
  });
});

describe("txKind", () => {
  it("cash and PayU → null key", () => {
    const cash = { description: "Gotówka: Zakupy dom", counterparty: null, importHash: "cash:123e4567-e89b-12d3-a456-426614174000" };
    expect(txKind(cash)).toBe("cash");
    expect(similarityKey(cash)).toBeNull();
    const payu = { description: "PayU S.A. zamówienie 12345", counterparty: "PayU" };
    expect(txKind(payu)).toBe("opaque");
    expect(similarityKey(payu)).toBeNull();
  });
  it("Żabka in two towns → same purchase key M|ZABKA", () => {
    const a = card("ZABKA Z5412 K.2 SUCHY LAS");
    const b = card("ZABKA ZC872 K.2 POZNAN", "4.50");
    expect(txKind(a)).toBe("purchase");
    expect(similarityKey(a)).toBe("M|ZABKA");
    expect(similarityKey(b)).toBe("M|ZABKA");
  });
  it("card payment in a foreign currency → the shop name, not the bank prefix", () => {
    const t = card("NETFLIX.COM LOS GATOS", "14.99", "USD");
    expect(txIdentity(t).merchant).toBe("NETFLIX.COM LOS GATOS");
  });
});

describe("rules", () => {
  it("ruleFromTx: transfer → title + recipient; purchase → full shop name; cash → null", () => {
    expect(ruleFromTx(transfer("Przelew na telefon", "Szymon Trener Siłownia"))).toEqual({
      pattern: "PRZELEW NA TELEFON",
      counterparty_pattern: "SZYMON TRENER SIŁOWNIA",
    });
    expect(ruleFromTx(card("ZABKA Z5412 K.2 SUCHY LAS"))).toEqual({ pattern: "ZABKA Z K. SUCHY LAS", counterparty_pattern: null });
    expect(ruleFromTx({ description: "Gotówka: X", counterparty: null, importHash: "cash:abc" })).toBeNull();
  });

  it("validateRule: generic or short pattern without a recipient → rejected; with a recipient → OK", () => {
    for (const p of ["PRZELEW", "PRZELEW NA TELEFON", "JAN", "GOTÓWKA:", "OPLATA", "WPŁATA", "ABC"]) {
      expect(validateRule(p, null)).toBe(TOO_GENERAL_MESSAGE);
    }
    expect(validateRule("PRZELEW NA TELEFON", "ANNA KUBIAK")).toBeNull();
    expect(validateRule("NETFLIX.COM LOS GATOS", null)).toBeNull();
    expect(validateRule("", "ANNA KUBIAK")).toBe(TOO_GENERAL_MESSAGE);
  });

  it("matchRule: the specific rule (recipient + title) wins over the general one", () => {
    const rules = sortRules([
      { id: "general", pattern: "PRZELEW NA TELEFON", counterparty_pattern: null, created_at: "2026-01-01" },
      { id: "trainer", pattern: "PRZELEW NA TELEFON", counterparty_pattern: "SZYMON TRENER SIŁOWNIA", created_at: "2026-02-01" },
    ]);
    expect(matchRule(rules, transfer("Przelew na telefon", "Szymon Trener Siłownia"))?.id).toBe("trainer");
    expect(matchRule(rules, transfer("Przelew na telefon", "Anna Kubiak"))?.id).toBe("general");
  });

  it("matchRule: longer pattern first; ties by created_at; deterministic", () => {
    const rules = sortRules([
      { id: "short", pattern: "AMAZON", created_at: "2026-01-01" },
      { id: "long", pattern: "AMAZON MKTPL", created_at: "2026-03-01" },
      { id: "tieNew", pattern: "LIDL", created_at: "2026-05-01" },
      { id: "tieOld", pattern: "KAUF", created_at: "2026-04-01" },
    ]);
    expect(rules.map((r) => r.id)).toEqual(["long", "short", "tieOld", "tieNew"]);
    expect(matchRule(rules, card("AMAZON MKTPL*7T6FQ4573 SEATTLE"))?.id).toBe("long");
  });

  it("matchRule: recipient-only rule (no counterparty_pattern) still matches the counterparty", () => {
    const rules = sortRules([{ id: "r", pattern: "SZYMON TRENER SIŁOWNIA" }]);
    expect(matchRule(rules, transfer("Przelew na telefon", "Szymon Trener Siłownia"))?.id).toBe("r");
  });

  it("matchRule: rule with a recipient needs both parts", () => {
    const rules = sortRules([{ id: "r", pattern: "PRZELEW NA TELEFON", counterparty_pattern: "ANNA KUBIAK" }]);
    expect(matchRule(rules, transfer("Przelew", "Anna Kubiak"))).toBeNull();
    expect(matchRule(rules, transfer("Przelew na telefon", "Anna Nowak"))).toBeNull();
  });

  it("matchRule: old stored patterns with digits still match (both sides normalized)", () => {
    const rules = sortRules([{ id: "fee", pattern: "OPŁ. ZA PAKIET BANKOMATOWY OD 01.04.2026 DO 30.04." }]);
    expect(
      matchRule(rules, { description: "Opł. za Pakiet bankomatowy od 01.12.2026 do 31.12.2026 dot.karty", counterparty: null })?.id
    ).toBe("fee");
  });

  it("matchRule: a pattern of only digits never matches everything", () => {
    expect(matchRule(sortRules([{ id: "x", pattern: "12345" }]), card("LIDL"))).toBeNull();
  });
});
