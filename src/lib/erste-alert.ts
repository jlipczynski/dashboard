// Erste "Alerty24" e-mail → transaction. Deterministic parser, no AI, no I/O.
// Unknown layouts (activation codes, card payments without a sample yet…) → { ok: false } with a reason;
// the import counts them as "unparsed" and never guesses fields.
// Account numbers are never returned: they are masked to the last 4 digits wherever they appear.

export type ErsteAlert = {
  date: string; // YYYY-MM-DD (operation date: "Kiedy", fallback "Data księgowania")
  amountGrosze: number; // signed: debit < 0, credit > 0
  counterparty: string | null;
  title: string;
  balanceGrosze: number | null;
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
  "Ile",
  "Tytuł",
  "Kiedy",
  "Data księgowania",
  "Saldo",
  "Identyfikator wiadomości",
] as const;
type Label = (typeof LABELS)[number];

// 26-digit Polish account number (optionally "PL", spaces / nbsp between groups).
const ACCOUNT_RE = /\b(?:PL)?\d{2}(?:[  ]?\d{4}){6}\b/g;

/** "…2727" instead of a full account number. */
export function maskAccounts(s: string): string {
  return s.replace(ACCOUNT_RE, (m) => `…${m.replace(/\D/g, "").slice(-4)}`);
}

/** "15 861,95 PLN" / "9,80" / "1.234,50" → grosze (unsigned). null when not a clean amount. */
export function parseAmountGrosze(input: string): number | null {
  const s = input.replace(/PLN|zł/gi, "").replace(/[\s ]/g, "").trim();
  const m = s.match(/^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/);
  if (!m) return null;
  const zl = parseInt(m[1].replace(/\./g, ""), 10);
  const gr = m[2] ? parseInt(m[2].padEnd(2, "0"), 10) : 0;
  return zl * 100 + gr;
}

function parseDatePL(s: string | undefined): string | null {
  const m = s?.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

/** HTML mail → text with one "Label: value" per line (table cells joined by ": "). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/t[dh]>\s*<t[dh][^>]*>/gi, ": ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function fields(text: string): Partial<Record<Label, string>> {
  const out: Partial<Record<Label, string>> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    for (const label of LABELS) {
      const m = line.match(new RegExp(`^${label}\\s*:\\s*(.+)$`, "i"));
      if (m && out[label] === undefined) {
        out[label] = m[1].trim();
        break;
      }
    }
  }
  return out;
}

export function parseErsteAlert(text: string): ParseResult {
  const dir = text.match(/Stan Twojego konta (zmniejszył|zwiększył)\S*\s+się\s+o\s+([\d\s .,]+)\s*PLN/i);
  if (!dir) return { ok: false, reason: "brak zdania o zmianie stanu konta" };
  const sign = dir[1].toLowerCase().startsWith("zmniejszył") ? -1 : 1;

  const f = fields(text);
  const fromSentence = parseAmountGrosze(dir[2]);
  const fromField = f["Ile"] !== undefined ? parseAmountGrosze(f["Ile"]) : null;
  if (f["Ile"] !== undefined && fromField === null) return { ok: false, reason: "nieczytelna kwota w polu Ile" };
  if (fromField !== null && fromSentence !== null && fromField !== fromSentence) {
    return { ok: false, reason: "kwota w zdaniu różni się od pola Ile" };
  }
  const grosze = fromField ?? fromSentence;
  if (!grosze) return { ok: false, reason: "brak kwoty" };

  const date = parseDatePL(f["Kiedy"]) ?? parseDatePL(f["Data księgowania"]);
  if (!date) return { ok: false, reason: "brak daty" };

  const title = f["Tytuł"] ? maskAccounts(f["Tytuł"]) : "";
  if (!title) return { ok: false, reason: "brak tytułu" };

  const party = f["Odbiorca"] ?? f["Nadawca"] ?? f["Zleceniodawca"] ?? null;
  let balanceGrosze: number | null = null;
  if (f["Saldo"] !== undefined) {
    const raw = f["Saldo"].trim();
    const b = parseAmountGrosze(raw.replace(/^-/, ""));
    if (b !== null) balanceGrosze = raw.startsWith("-") ? -b : b;
  }

  return {
    ok: true,
    alert: {
      date,
      amountGrosze: sign * grosze,
      counterparty: party ? maskAccounts(party) : null,
      title,
      balanceGrosze,
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
