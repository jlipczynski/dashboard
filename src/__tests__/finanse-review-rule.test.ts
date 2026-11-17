import { describe, it, expect } from "vitest";
import { reviewRule, NO_RULE_MESSAGE, type ReviewRuleTx } from "../lib/finanse-review-rule";
import { TOO_GENERAL_MESSAGE } from "../lib/finanse-rules";

const tx = (over: Partial<ReviewRuleTx>): ReviewRuleTx => ({
  description: "DOP. MC ****8847 PŁATNOŚĆ KARTĄ 24.99 PLN ROSSMANN 36 Poznan",
  counterparty: "ROSSMANN 36 Poznan",
  merchant: "ROSSMANN 36 Poznan",
  import_hash: "email:abc",
  category_id: "cat-inne",
  subcategory_id: null,
  ...over,
});

describe("reviewRule — 'Zapamiętaj dla …' on /finanse/przeglad", () => {
  it("no rule when the category and subcategory did not change", () => {
    expect(reviewRule(tx({}), "cat-inne", null)).toEqual({ kind: "none" });
  });

  it("no rule when the category was cleared", () => {
    expect(reviewRule(tx({}), null, null)).toEqual({ kind: "none" });
  });

  it("purchase: category changed → rule on the shop name", () => {
    const r = reviewRule(tx({}), "cat-zdrowie", null);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.counterparty_pattern).toBeNull();
      expect(r.pattern).toContain("ROSSMANN");
      expect(r.target).toBe(r.pattern);
    }
  });

  it("subcategory change alone also counts as a change", () => {
    expect(reviewRule(tx({ category_id: "cat-zdrowie" }), "cat-zdrowie", "sub-kosmetyki").kind).toBe("ok");
  });

  it("transfer with a recipient → title + recipient (like Historia)", () => {
    const r = reviewRule(
      tx({ description: "Przelew na telefon", counterparty: "Monika (Iśka)", merchant: null, import_hash: "csv:1" }),
      "cat-jedzenie",
      null
    );
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.pattern).toBe("PRZELEW NA TELEFON");
      expect(r.counterparty_pattern).toContain("MONIKA");
      expect(r.target).toBe(r.counterparty_pattern);
    }
  });

  it("too general pattern without a recipient ('Przelew na telefon') → rejected with the message", () => {
    const r = reviewRule(tx({ description: "Przelew na telefon", counterparty: null, merchant: null, import_hash: "csv:2" }), "cat-x", null);
    expect(r).toEqual({ kind: "invalid", message: TOO_GENERAL_MESSAGE });
  });

  it("cash and payment intermediaries → no rule possible", () => {
    expect(reviewRule(tx({ import_hash: "cash:1", description: "Gotówka: kawa" }), "cat-x", null)).toEqual({
      kind: "invalid",
      message: NO_RULE_MESSAGE,
    });
    expect(reviewRule(tx({ description: "PAYU SA zamówienie 123", counterparty: "PayU", merchant: null }), "cat-x", null)).toEqual({
      kind: "invalid",
      message: NO_RULE_MESSAGE,
    });
  });
});
