import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getGoogleAccessToken } from "@/lib/google-token";
import { getSupabaseAdmin } from "@/lib/finanse-db";

type GmailMessage = { id: string };
type GmailHeader = { name: string; value: string };
type MessagePart = {
  mimeType: string;
  body: { data?: string };
  parts?: MessagePart[];
};

function extractText(part: MessagePart): string {
  if (part.mimeType === "text/plain" && part.body?.data) {
    return Buffer.from(part.body.data, "base64url").toString("utf-8").slice(0, 1200);
  }
  if (part.parts) {
    return part.parts.map(extractText).filter(Boolean).join("\n").slice(0, 1200);
  }
  return "";
}

export async function POST(request: NextRequest) {
  const accessToken = await getGoogleAccessToken(request);

  const { date, merchant, amount, counterparty, description, key } = await request.json();

  const d = new Date(date + "T12:00:00Z");
  const fmt = (dt: Date) =>
    `${dt.getUTCFullYear()}/${String(dt.getUTCMonth() + 1).padStart(2, "0")}/${String(dt.getUTCDate()).padStart(2, "0")}`;
  const after = fmt(new Date(d.getTime() - 7 * 86400000));
  const before = fmt(new Date(d.getTime() + 8 * 86400000));

  const absAmount = Math.abs(amount);
  const amountComma = absAmount.toFixed(2).replace(".", ",");
  const amountDot = absAmount.toFixed(2);

  type EmailResult = { subject: string; from: string; date: string; body: string };
  let emails: EmailResult[] = [];

  if (accessToken) {
    const queries = [
      `"${amountComma}" after:${after} before:${before}`,
      `"${amountDot}" after:${after} before:${before}`,
      `after:${after} before:${before} (paragon OR receipt OR potwierdzenie OR zakup OR zamówienie OR "order confirmation" OR "payment confirmation")`,
    ];

    const seenIds = new Set<string>();
    for (const q of queries) {
      try {
        const res = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=5`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (res.ok) {
          const data = await res.json();
          for (const m of (data.messages || []) as GmailMessage[]) seenIds.add(m.id);
        }
      } catch {}
    }

    emails = (
      await Promise.all(
        [...seenIds].slice(0, 7).map(async (id) => {
          try {
            const res = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            if (!res.ok) return null;
            const msg = await res.json();
            const headers: GmailHeader[] = msg.payload?.headers || [];
            const get = (name: string) => headers.find((h) => h.name === name)?.value || "";
            const body = extractText(msg.payload || {});
            return { subject: get("Subject"), from: get("From"), date: get("Date"), body };
          } catch {
            return null;
          }
        })
      )
    ).filter(Boolean) as EmailResult[];
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      emails: emails.map((e) => ({ subject: e.subject, from: e.from, snippet: e.body.slice(0, 200) })),
      suggestion: null,
      key,
    });
  }

  const admin = getSupabaseAdmin();
  const { data: categoriesData } = await admin.from("finance_categories").select("id, name, type");
  const categories = categoriesData || [];
  const categoryList = categories.map((c) => `${c.id} | ${c.name}`).join("\n");

  const emailContext =
    emails.length > 0
      ? emails
          .map((e, i) => `[${i + 1}] Od: ${e.from}\nTemat: ${e.subject}\nData: ${e.date}\nTreść:\n${e.body}`)
          .join("\n\n---\n\n")
      : "Brak maili (Gmail nie połączony lub brak wyników dla tej kwoty)";

  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    defaultHeaders: { "anthropic-beta": "web-search-2025-03-05" },
  });

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 700,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: [{ type: "web_search_20250305", name: "web_search" } as any],
      messages: [
        {
          role: "user",
          content: `Zidentyfikuj co to za płatność bankowa i przypisz do kategorii.

TRANSAKCJA:
- Opis w banku: "${description || merchant}"
- Merchant: "${merchant}"${counterparty ? `\n- Kontrahent: "${counterparty}"` : ""}
- Kwota: ${amount} PLN
- Data: ${date}

MAILE Z TEGO OKRESU (szukane po kwocie ${amountComma} PLN i słowach kluczowych):
${emailContext}

INSTRUKCJA:
1. Sprawdź czy któryś mail pasuje do tej transakcji (szukaj kwoty ${amountDot} lub nazwy merchanty)
2. Jeśli merchant/kontrahent jest nieznany — przeszukaj internet żeby ustalić co to za firma
3. Na tej podstawie zaproponuj kategorię i napisz zwięzłe wyjaśnienie (max 120 znaków)

KATEGORIE:
${categoryList}

Odpowiedz TYLKO w formacie JSON (bez markdown): {"categoryId": "uuid lub null", "note": "wyjaśnienie po polsku"}`,
        },
      ],
    });

    const textContent = message.content.find((c) => c.type === "text");
    const text = textContent?.type === "text" ? textContent.text : "";
    const match = text.match(/\{[\s\S]*?\}/);
    const parsed = match ? JSON.parse(match[0]) : null;

    const suggestion = parsed
      ? {
          categoryId:
            parsed.categoryId && categories.some((c) => c.id === parsed.categoryId)
              ? parsed.categoryId
              : null,
          note: parsed.note || "",
          key,
        }
      : null;

    return NextResponse.json({
      emails: emails.map((e) => ({ subject: e.subject, from: e.from, snippet: e.body.slice(0, 200) })),
      suggestion,
      key,
    });
  } catch {
    return NextResponse.json({ emails: [], suggestion: null, key });
  }
}
