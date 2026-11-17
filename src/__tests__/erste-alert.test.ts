// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseErsteAlert, parseAmountGrosze, maskAccounts, htmlToText, gmailBodyText } from "../lib/erste-alert";

// Real layout from 17.11 (account numbers replaced with fake ones).
const DEBIT = [
  "Stan Twojego konta zmniejszył się o 9,80 PLN.",
  "Z konta: 00 0000 0000 0000 0000 0000 1111",
  "Do kogo: 00 0000 0000 0000 0000 0000 2222",
  "Odbiorca: JAN KRZYSZTOF LIPCZYŃSKI",
  "Ile: 9,80 PLN",
  "Tytuł: Wpłata końcówek na cel- zakup przy użyciu karty na kwotę 27.02 PLN (mnożnik x10)",
  "Kiedy: 17-11-2026",
  "Data księgowania: 17-11-2026",
  "Saldo: 15 861,95 PLN",
  "Identyfikator wiadomości: -1524172797",
].join("\n");

describe("parseErsteAlert", () => {
  it("debit (zmniejszył się) → negative amount, date, payee, title, balance; no account numbers", () => {
    const r = parseErsteAlert(DEBIT);
    expect(r).toEqual({
      ok: true,
      alert: {
        date: "2026-11-17",
        amountGrosze: -980,
        counterparty: "JAN KRZYSZTOF LIPCZYŃSKI",
        title: "Wpłata końcówek na cel- zakup przy użyciu karty na kwotę 27.02 PLN (mnożnik x10)",
        balanceGrosze: 1586195,
      },
    });
    expect(JSON.stringify(r)).not.toMatch(/0000 0000/);
  });

  it("credit (zwiększył się) → positive amount; sender as counterparty", () => {
    const credit = DEBIT.replace("zmniejszył się o 9,80", "zwiększył się o 1 250,00")
      .replace("Ile: 9,80 PLN", "Ile: 1 250,00 PLN")
      .replace("Odbiorca: JAN KRZYSZTOF LIPCZYŃSKI", "Nadawca: FIRMA TESTOWA SP. Z O.O.");
    const r = parseErsteAlert(credit);
    expect(r.ok && r.alert.amountGrosze).toBe(125000);
    expect(r.ok && r.alert.counterparty).toBe("FIRMA TESTOWA SP. Z O.O.");
  });

  it("mail without the fields (e.g. activation code) → unparsed, no guessing", () => {
    expect(parseErsteAlert("Twój kod aktywacyjny to 123456. Nie przekazuj go nikomu.")).toEqual({
      ok: false,
      reason: "brak zdania o zmianie stanu konta",
    });
    expect(parseErsteAlert("Stan Twojego konta zmniejszył się o 5,00 PLN.\nIle: 5,00 PLN").ok).toBe(false);
  });

  it("amount in the sentence differs from Ile → unparsed", () => {
    expect(parseErsteAlert(DEBIT.replace("Ile: 9,80 PLN", "Ile: 19,80 PLN"))).toEqual({
      ok: false,
      reason: "kwota w zdaniu różni się od pola Ile",
    });
  });

  it("an account number inside the title is masked to the last 4 digits", () => {
    const r = parseErsteAlert(DEBIT.replace(/Tytuł: .*/, "Tytuł: Zwrot na 00 0000 0000 0000 0000 0000 3333 dzięki"));
    expect(r.ok && r.alert.title).toBe("Zwrot na …3333 dzięki");
  });

  it("HTML table layout (cells) parses the same as plain text", () => {
    const rows = DEBIT.split("\n")
      .slice(1)
      .map((l) => {
        const i = l.indexOf(": ");
        return `<tr><td>${l.slice(0, i)}</td><td>${l.slice(i + 2)}</td></tr>`;
      })
      .join("");
    const html = `<p>Stan Twojego konta zmniejszył się o 9,80&nbsp;PLN.</p><table>${rows}</table>`;
    const r = parseErsteAlert(htmlToText(html));
    expect(r.ok && r.alert.amountGrosze).toBe(-980);
    expect(r.ok && r.alert.date).toBe("2026-11-17");
    expect(r.ok && r.alert.counterparty).toBe("JAN KRZYSZTOF LIPCZYŃSKI");
  });
});

describe("helpers", () => {
  it("parseAmountGrosze: spaces, nbsp, thousand dots, comma decimals", () => {
    expect(parseAmountGrosze("15 861,95 PLN")).toBe(1586195);
    expect(parseAmountGrosze("15 861,95")).toBe(1586195);
    expect(parseAmountGrosze("1.234,5")).toBe(123450);
    expect(parseAmountGrosze("9")).toBe(900);
    expect(parseAmountGrosze("abc")).toBeNull();
  });
  it("maskAccounts keeps only the last 4 digits", () => {
    expect(maskAccounts("PL00 0000 0000 0000 0000 0000 4321 i 00000000000000000000001234")).toBe("…4321 i …1234");
  });
  it("gmailBodyText prefers text/plain, falls back to HTML", () => {
    const enc = (s: string) => Buffer.from(s).toString("base64url");
    expect(
      gmailBodyText({
        mimeType: "multipart/alternative",
        parts: [
          { mimeType: "text/html", body: { data: enc("<b>html</b>") } },
          { mimeType: "text/plain", body: { data: enc("plain") } },
        ],
      })
    ).toBe("plain");
    expect(gmailBodyText({ mimeType: "text/html", body: { data: enc("<p>a</p><p>b</p>") } })).toBe("a\nb");
  });
});
