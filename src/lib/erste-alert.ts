// Erste "Alerty24" e-mail → transaction. Deterministic parser, no AI, no I/O.
// Real layouts (verified on Jan's mails, 2026-11-17) — HTML only, every label and value in its own
// nested table cell, so after HTML → text a label ("Kiedy:") and its value are on separate lines:
//   1. debit   "Stan Twojego konta zmniejszył się o 9,80 PLN."  Odbiorca, Ile, Tytuł, Kiedy, Saldo
//   2. credit  "Na Twoje konto wpłynęło 672,00 PLN od …"         Tytuł, Od kogo, Ile, Saldo
//   3. card    "Rozliczyliśmy już Twoją płatność kartą debetową." Karta, Ile (signed), Kiedy, Gdzie — no balance
// Anything else (activation codes, unknown layouts) → { ok: false } with a reason: counted as "unparsed",
// fields are never guessed. Account numbers are never returned (masked to the last 4 digits).

export type ErsteKind = "debit" | "credit" | "card";

export type ErsteAlert = {
  kind: ErsteKind;
  date: string; // YYYY-MM-DD (operation date: "Kiedy", fallback "Data księgowania", credit: date in the sender line)
  amountGrosze: number; // signed: outflow < 0, inflow > 0
  counterparty: string | null; // payee / sender / card merchant ("Gdzie")
  title: string; // transfer title; card: "PŁATNOŚĆ KARTĄ 35.99 PLN SHOP" (same shape as the bank CSV)
  balanceGrosze: number | null; // balance after the operation (not in card alerts)
  cardLast4: string | null;
};
export type ParseResult = { ok: true; alert: ErsteAlert } | { ok: false; reason: string };

const LABELS = [
  "Z konta",
  "Na konto",
  "Do kogo",
  "Od kogo",
  "Odbiorca",
  "Nadawca",
  "Zleceniodawca",
  "Karta",
  "Ile",
  "Tytuł",
  "Kiedy",
  "Gdzie",
  "Data księgowania",
  "Saldo",
] as const;
type Label = (typeof LABELS)[number];

// 26-digit Polish account number (optionally "PL", spaces / nbsp between groups).
const ACCOUNT_RE = /\b(?:PL)?\d{2}(?:[  ]?\d{4}){6}\b/g;

/** "…2727" instead of a full account number. */
export function maskAccounts(s: string): string {
  return s.replace(ACCOUNT_RE, (m) => `…${m.replace(/\D/g, "").slice(-4)}`);
}

/** "15 861,95 PLN" / "9,80" / "1.234,50" / "-35,99 PLN" → signed grosze. null when not a clean amount. */
export function parseAmountGrosze(input: string): number | null {
  let s = input.replace(/PLN|zł/gi, "").replace(/[\s ]/g, "").trim();
  let sign = 1;
  if (s.startsWith("-") || s.startsWith("−")) {
    sign = -1;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  const m = s.match(/^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/);
  if (!m) return null;
  const zl = parseInt(m[1].replace(/\./g, ""), 10);
  const gr = m[2] ? parseInt(m[2].padEnd(2, "0"), 10) : 0;
  return sign * (zl * 100 + gr);
}

function parseDatePL(s: string | undefined | null): string | null {
  const m = s?.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

/** HTML mail → text: one cell / paragraph per line, entities decoded. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|tr|td|th|li|h\d|table)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#xA0;|&#160;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

/** Clean lines: trims markdown table pipes / headings the Gmail text view may add. */
function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s|#]+|[\s|]+$/g, "").trim())
    .filter((l) => l && !/^-{3,}(\|-{3,})*$/.test(l));
}

const LABEL_RE = new RegExp(`^(${LABELS.join("|")})\\s*:\\s*(.*)$`, "i");

/** "Label: value" on one line, or "Label:" followed by the value on the next line. */
export function fields(text: string): Partial<Record<Label, string>> {
  const out: Partial<Record<Label, string>> = {};
  const ls = lines(text);
  for (let i = 0; i < ls.length; i++) {
    const m = ls[i].match(LABEL_RE);
    if (!m) continue;
    const label = LABELS.find((l) => l.toLowerCase() === m[1].toLowerCase())!;
    let value = m[2].trim();
    if (!value && i + 1 < ls.length && !LABEL_RE.test(ls[i + 1])) value = ls[i + 1].trim();
    if (value && out[label] === undefined) out[label] = value;
  }
  return out;
}

const fail = (reason: string): ParseResult => ({ ok: false, reason });

function balanceOf(f: Partial<Record<Label, string>>): number | null {
  return f["Saldo"] !== undefined ? parseAmountGrosze(f["Saldo"]) : null;
}

export function parseErsteAlert(text: string): ParseResult {
  const f = fields(text);
  const flat = lines(text).join(" ");

  // 3. Card payment
  if (/Rozliczyliśmy już Twoją płatność kartą/i.test(flat)) {
    const amount = f["Ile"] !== undefined ? parseAmountGrosze(f["Ile"]) : null;
    if (amount === null || amount === 0) return fail("płatność kartą: brak lub nieczytelna kwota");
    const date = parseDatePL(f["Kiedy"]);
    if (!date) return fail("płatność kartą: brak daty");
    const where = f["Gdzie"]?.trim();
    if (!where) return fail("płatność kartą: brak miejsca (Gdzie)");
    const card = f["Karta"]?.match(/(\d{4})\s*$/)?.[1] ?? null;
    const abs = Math.abs(amount);
    return {
      ok: true,
      alert: {
        kind: "card",
        date,
        amountGrosze: amount,
        counterparty: maskAccounts(where),
        // Same shape as the bank CSV description, so rules and merchant extraction work the same way.
        title: maskAccounts(
          `${card ? `DOP. MC ****${card} ` : ""}PŁATNOŚĆ KARTĄ ${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")} PLN ${where}`
        ),
        balanceGrosze: null,
        cardLast4: card,
      },
    };
  }

  // 2. Incoming transfer
  const credit = flat.match(/Na Twoje konto wpłynęło\s+([\d\s .,]+)\s*PLN/i);
  // 1. Debit (or "zwiększył się" credit)
  const change = flat.match(/Stan Twojego konta (zmniejszył|zwiększył)\S*\s+się\s+o\s+([\d\s .,]+?)\s*PLN/i);
  if (!credit && !change) return fail("nieznany układ maila (np. kod aktywacyjny)");

  const sign = credit ? 1 : change![1].toLowerCase().startsWith("zmniejszył") ? -1 : 1;
  const fromSentence = parseAmountGrosze((credit ? credit[1] : change![2]).trim());
  const fromField = f["Ile"] !== undefined ? parseAmountGrosze(f["Ile"]) : null;
  if (f["Ile"] !== undefined && fromField === null) return fail("nieczytelna kwota w polu Ile");
  if (fromField !== null && fromSentence !== null && Math.abs(fromField) !== Math.abs(fromSentence)) {
    return fail("kwota w zdaniu różni się od pola Ile");
  }
  const grosze = Math.abs(fromField ?? fromSentence ?? 0);
  if (!grosze) return fail("brak kwoty");

  // Credit alerts have no "Kiedy": the date is at the end of the sender line ("… ELIXIR 17-11-2026").
  const senderDate = (f["Od kogo"] ?? "").match(/(\d{2}-\d{2}-\d{4})\s*$/)?.[1] ?? null;
  const date = parseDatePL(f["Kiedy"]) ?? parseDatePL(f["Data księgowania"]) ?? parseDatePL(senderDate);
  if (!date) return fail("brak daty");

  const title = f["Tytuł"] ? maskAccounts(f["Tytuł"]) : "";
  if (!title) return fail("brak tytułu");

  const partyRaw = f["Odbiorca"] ?? f["Nadawca"] ?? f["Zleceniodawca"] ?? f["Od kogo"] ?? null;
  const party = partyRaw ? maskAccounts(partyRaw.replace(/\s+ELIXIR\s+\d{2}-\d{2}-\d{4}\s*$/i, "").trim()) : null;

  return {
    ok: true,
    alert: {
      kind: sign < 0 ? "debit" : "credit",
      date,
      amountGrosze: sign * grosze,
      counterparty: party,
      title,
      balanceGrosze: balanceOf(f),
      cardLast4: null,
    },
  };
}

type GmailPart = { mimeType?: string; body?: { data?: string }; parts?: GmailPart[] };

const b64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");

/** Text of a Gmail "full" payload: text/plain if present, otherwise HTML converted to text. */
export function gmailBodyText(payload: GmailPart | undefined): string {
  const plain: string[] = [];
  const html: string[] = [];
  const walk = (p: GmailPart | undefined) => {
    if (!p) return;
    if (p.body?.data) {
      if (p.mimeType === "text/plain") plain.push(b64url(p.body.data));
      else if (p.mimeType === "text/html") html.push(b64url(p.body.data));
    }
    p.parts?.forEach(walk);
  };
  walk(payload);
  if (plain.length) return plain.join("\n");
  return html.map(htmlToText).join("\n");
}
