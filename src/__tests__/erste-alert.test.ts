// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseErsteAlert, parseAmountGrosze, maskAccounts, htmlToText, gmailBodyText, fields } from "../lib/erste-alert";

// Structure of the real Erste HTML (2026-11-17): every label and value sits in its own nested table cell.
// Account / card numbers below are FAKE.
const cell = (text: string) =>
  `<th class="small-6 large-3 columns"><table role="Presentation"><tr><th>\n            <p class="alternative-text">\n            ${text}\n            </p>\n        </th></tr></table></th>`;
const value = (text: string) =>
  `<th class="small-10 large-13 columns last"><table role="Presentation"><tr><th>\n            <b>\n            ${text}\n            </b>\n        </th></tr></table></th>`;
const row = (label: string, val: string) => `<table class="row"><tbody><tr>${cell(`${label}:`)}${value(val)}</tr></tbody></table>`;
const html = (lead: string, rows: [string, string][], extra = "") =>
  `<html><head><style>p{color:red}</style></head><body><h6>${lead}</h6><p>Szczegóły:</p>${rows.map(([l, v]) => row(l, v)).join("")}${extra}` +
  `<p>Identyfikator wiadomości: -1500000000</p></body></html>`;

const DEBIT_HTML = html("Stan Twojego konta zmniejszył się o 9,80&nbsp;PLN.", [
  ["Z konta", "00 0000 0000 0000 0000 0000 1111"],
  ["Do kogo", "00 0000 0000 0000 0000 0000 2222"],
  ["Odbiorca", "JAN KRZYSZTOF LIPCZYŃSKI"],
  ["Ile", "9,80 PLN"],
  ["Tytuł", "Wpłata końcówek na cel- zakup przy użyciu karty na kwotę 27.02 PLN (mnożnik x10)"],
  ["Kiedy", "17-11-2026"],
  ["Data księgowania", "17-11-2026"],
  ["Saldo", "15 861,95 PLN"],
]);

const CARD_HTML = html("Rozliczyliśmy już Twoją płatność kartą debetową.", [
  ["Karta", "Dopasowana Mastercard 0000"],
  ["Ile", "-35,99 PLN"],
  ["Kiedy", "16-11-2026"],
  ["Gdzie", "Allegro Poznan"],
]);

const CREDIT_HTML = html("Na Twoje konto wpłynęło 672,00 PLN od FIRMA TESTOWA SP. Z O.O. ul. TESTOWA 1 00-000 MIASTO ELIXIR 17-11-2026.", [
  ["Tytuł", "Zwrot nadpłaty za odbiór odpadów"],
  ["Od kogo", "FIRMA TESTOWA SP. Z O.O. ul. TESTOWA 1 00-000 MIASTO ELIXIR 17-11-2026"],
  ["Ile", "672,00 PLN"],
  ["Na konto", "00 0000 0000 0000 0000 0000 1111"],
  ["Saldo", "16 375,45 PLN"],
]);

const ACTIVATION_HTML =
  "<p>Otrzymujesz tę wiadomość, ponieważ Twój adres e-mail został podany jako adres, do wysyłania powiadomień Alerty24.</p>" +
  "<table><tr><th>Kod aktywacyjny: 12345678</th></tr></table>";

describe("parseErsteAlert — real HTML layouts", () => {
  it("debit: label and value on separate lines → negative amount, payee, title, balance; no account numbers", () => {
    const r = parseErsteAlert(htmlToText(DEBIT_HTML));
    expect(r).toEqual({
      ok: true,
      alert: {
        kind: "debit",
        date: "2026-11-17",
        amountGrosze: -980,
        counterparty: "JAN KRZYSZTOF LIPCZYŃSKI",
        title: "Wpłata końcówek na cel- zakup przy użyciu karty na kwotę 27.02 PLN (mnożnik x10)",
        balanceGrosze: 1586195,
        cardLast4: null,
      },
    });
    expect(JSON.stringify(r)).not.toMatch(/0000 0000/);
  });

  it("card payment: signed amount, operation date, shop, card last 4; title shaped like the bank CSV", () => {
    const r = parseErsteAlert(htmlToText(CARD_HTML));
    expect(r).toEqual({
      ok: true,
      alert: {
        kind: "card",
        date: "2026-11-16",
        amountGrosze: -3599,
        counterparty: "Allegro Poznan",
        title: "DOP. MC ****0000 PŁATNOŚĆ KARTĄ 35.99 PLN Allegro Poznan",
        balanceGrosze: null,
        cardLast4: "0000",
      },
    });
  });

  it("incoming transfer: positive amount, sender without the ELIXIR date, date from the sender line", () => {
    const r = parseErsteAlert(htmlToText(CREDIT_HTML));
    expect(r.ok && r.alert).toMatchObject({
      kind: "credit",
      date: "2026-11-17",
      amountGrosze: 67200,
      counterparty: "FIRMA TESTOWA SP. Z O.O. ul. TESTOWA 1 00-000 MIASTO",
      title: "Zwrot nadpłaty za odbiór odpadów",
      balanceGrosze: 1637545,
    });
  });

  it("activation code / unknown layout → unparsed, no guessing", () => {
    expect(parseErsteAlert(htmlToText(ACTIVATION_HTML))).toEqual({ ok: false, reason: "nieznany układ maila (np. kod aktywacyjny)" });
  });

  it("Gmail text view (markdown table pipes) parses the same", () => {
    const md = [
      "| ###### Stan Twojego konta zmniejszył się o 0,10 PLN. ------------------------------ Szczegóły: |",
      "|---|",
      "| Odbiorca: |",
      "|---|",
      "| JAN KRZYSZTOF LIPCZYŃSKI |",
      "| Ile: |",
      "| 0,10 PLN |",
      "| Tytuł: |",
      "| Wpłata końcówek na cel- zakup przy użyciu karty na kwotę 35.99 PLN (mnożnik x10) |",
      "| Kiedy: |",
      "| 17-11-2026 |",
      "Saldo po operacji:",
      "| Saldo: |",
      "| 15 703,45 PLN |",
    ].join("\n");
    const r = parseErsteAlert(md);
    expect(r.ok && [r.alert.amountGrosze, r.alert.balanceGrosze, r.alert.date]).toEqual([-10, 1570345, "2026-11-17"]);
  });

  it("amount in the sentence differs from Ile → unparsed", () => {
    expect(parseErsteAlert(htmlToText(DEBIT_HTML.replace(">\n            9,80 PLN", ">\n            19,80 PLN")))).toEqual({
      ok: false,
      reason: "kwota w zdaniu różni się od pola Ile",
    });
  });

  it("an account number inside the title is masked to the last 4 digits", () => {
    const r = parseErsteAlert(htmlToText(DEBIT_HTML.replace("Wpłata końcówek", "Zwrot na 00 0000 0000 0000 0000 0000 3333 dla")));
    expect(r.ok && r.alert.title.startsWith("Zwrot na …3333 dla")).toBe(true);
  });
});

describe("helpers", () => {
  it("fields: 'Label: value' on one line or on the next line", () => {
    expect(fields("Ile: 5,00 PLN\nKiedy:\n17-11-2026")).toEqual({ Ile: "5,00 PLN", Kiedy: "17-11-2026" });
  });
  it("parseAmountGrosze: spaces, nbsp, thousand dots, comma decimals, sign", () => {
    expect(parseAmountGrosze("15 861,95 PLN")).toBe(1586195);
    expect(parseAmountGrosze("15 861,95")).toBe(1586195);
    expect(parseAmountGrosze("1.234,5")).toBe(123450);
    expect(parseAmountGrosze("-400,00 PLN")).toBe(-40000);
    expect(parseAmountGrosze("abc")).toBeNull();
  });
  it("maskAccounts keeps only the last 4 digits", () => {
    expect(maskAccounts("PL00 0000 0000 0000 0000 0000 4321 i 00000000000000000000001234")).toBe("…4321 i …1234");
  });
  it("gmailBodyText prefers text/plain, falls back to HTML (Erste sends HTML only)", () => {
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
    const r = parseErsteAlert(gmailBodyText({ mimeType: "text/html", body: { data: enc(CARD_HTML) } }));
    expect(r.ok && r.alert.amountGrosze).toBe(-3599);
  });
});
