import { describe, it, expect } from "vitest";
import { planEmailMatches, withinWindow, toGrosze, cardLast4, evidence } from "../lib/finanse-email-match";

const base = { date: "2026-11-17", amountGrosze: -980 };

describe("planEmailMatches — merge only with identifying evidence", () => {
  it("same amount + same balance-after → merge (basis: saldo)", () => {
    expect(planEmailMatches([{ ...base, balanceGrosze: 1586195 }], [{ id: "e1", ...base, date: "2026-11-18", balanceGrosze: 1586195 }])).toEqual([
      { action: "update", emailId: "e1", basis: "saldo" },
    ]);
  });

  it("same amount + date only (no balance, payee, title) → review, never merge", () => {
    const d = planEmailMatches([base], [{ id: "e1", ...base }]);
    expect(d).toEqual([{ action: "review", emailIds: ["e1"], reason: "zgadza się tylko kwota i data — brak salda, odbiorcy lub tytułu" }]);
  });

  it("different balance-after → not the same operation → insert", () => {
    expect(planEmailMatches([{ ...base, balanceGrosze: 100 }], [{ id: "e1", ...base, balanceGrosze: 200 }])).toEqual([{ action: "insert" }]);
  });

  it("payee AND title match (no balance) → merge; payee alone → review", () => {
    const csv = { ...base, counterparty: "JAN KRZYSZTOF LIPCZYŃSKI", title: "Wpłata końcówek na cel- zakup przy użyciu karty na kwotę 27.02 PLN" };
    const mail = { id: "e1", ...base, counterparty: "Jan Krzysztof Lipczyński", title: "Wpłata końcówek na cel- zakup przy użyciu karty na kwotę 27.02 PLN (mnożnik x10)" };
    expect(planEmailMatches([csv], [mail])).toEqual([{ action: "update", emailId: "e1", basis: "odbiorca+tytuł" }]);
    expect(planEmailMatches([{ ...csv, title: "coś innego" }], [mail])[0].action).toBe("review");
  });

  it("card payment: same card + shop inside the CSV description → merge (basis: karta+sklep), both directions", () => {
    const alert = { date: "2026-11-16", amountGrosze: -3599, counterparty: "Allegro Poznan", title: "DOP. MC ****0000 PŁATNOŚĆ KARTĄ 35.99 PLN Allegro Poznan", cardLast4: "0000" };
    const csv = { date: "2026-11-17", amountGrosze: -3599, counterparty: null, title: "DOP. MC 000000******0000 PŁATNOŚĆ KARTĄ 35.99 PLN Allegro Poznan", cardLast4: "0000", balanceGrosze: 1234 };
    expect(planEmailMatches([alert], [{ id: "csv1", ...csv }])).toEqual([{ action: "update", emailId: "csv1", basis: "karta+sklep" }]);
    expect(planEmailMatches([csv], [{ id: "mail1", ...alert }])).toEqual([{ action: "update", emailId: "mail1", basis: "karta+sklep" }]);
    // other shop, same card and amount → only a weak candidate → review
    expect(planEmailMatches([{ ...alert, counterparty: "ROSSMANN 36 Poznan" }], [{ id: "csv1", ...csv }])[0].action).toBe("review");
  });

  it("different card → not a candidate", () => {
    expect(planEmailMatches([{ ...base, cardLast4: "1111" }], [{ id: "e1", ...base, cardLast4: "2222" }])).toEqual([{ action: "insert" }]);
  });

  it("two identified counterparts → review (ambiguous)", () => {
    const d = planEmailMatches([{ ...base, balanceGrosze: 5 }], [
      { id: "e1", ...base, balanceGrosze: 5 },
      { id: "e2", ...base, date: "2026-11-16", balanceGrosze: 5 },
    ]);
    expect(d[0]).toMatchObject({ action: "review", emailIds: ["e1", "e2"], reason: "kilka operacji pasuje równie dobrze" });
  });

  it("one counterpart identified by two new rows → both to review", () => {
    const row = { ...base, balanceGrosze: 5 };
    const d = planEmailMatches([row, row], [{ id: "e1", ...base, balanceGrosze: 5 }]);
    expect(d.map((x) => x.action)).toEqual(["review", "review"]);
  });

  it("no candidate: other amount, sign or > 3 days → insert", () => {
    const existing = [
      { id: "a", ...base, amountGrosze: -981 },
      { id: "b", ...base, amountGrosze: 980 },
      { id: "c", ...base, date: "2026-11-10" },
    ];
    expect(planEmailMatches([base], existing)).toEqual([{ action: "insert" }]);
  });
});

describe("helpers", () => {
  it("cardLast4 reads a masked card number", () => {
    expect(cardLast4("DOP. MC 000000******1234 PŁATNOŚĆ KARTĄ")).toBe("1234");
    expect(cardLast4("Przelew")).toBeNull();
  });
  it("evidence: identical balance wins even when titles differ", () => {
    expect(evidence({ ...base, balanceGrosze: 7, title: "a" }, { ...base, balanceGrosze: 7, title: "zupełnie inny" }).basis).toBe("saldo");
  });
  it("withinWindow is inclusive at 3 days and crosses month ends", () => {
    expect(withinWindow("2026-11-30", "2026-12-03")).toBe(true);
    expect(withinWindow("2026-11-30", "2026-12-04")).toBe(false);
  });
  it("toGrosze avoids float drift", () => {
    expect(toGrosze("-9.80")).toBe(-980);
    expect(toGrosze(0.1 + 0.2)).toBe(30);
  });
});
