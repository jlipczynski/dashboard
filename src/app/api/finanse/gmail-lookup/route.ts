import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import Anthropic from "@anthropic-ai/sdk";
import { authOptions } from "@/lib/google-auth";
import { getSupabaseAdmin } from "@/lib/finanse-db";

type GmailMessage = {
  id: string;
  threadId: string;
};

type GmailHeader = {
  name: string;
  value: string;
};

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const accessToken = session?.accessToken as string | undefined;
  if (!accessToken) {
    return NextResponse.json({ error: "Zaloguj się ponownie żeby przyznać dostęp do Gmail" }, { status: 401 });
  }

  const { date, merchant, amount, importHash } = await request.json();

  // Build Gmail date range: date ± 2 days
  const d = new Date(date + "T12:00:00Z");
  const fmt = (dt: Date) =>
    `${dt.getUTCFullYear()}/${String(dt.getUTCMonth() + 1).padStart(2, "0")}/${String(dt.getUTCDate()).padStart(2, "0")}`;
  const after = fmt(new Date(d.getTime() - 2 * 86400000));
  const before = fmt(new Date(d.getTime() + 3 * 86400000));

  const query = `after:${after} before:${before} (paragon OR receipt OR potwierdzenie OR zakup OR zamówienie OR PayPal OR Apple OR "order confirmation" OR "payment confirmation")`;

  const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=8`;
  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!searchRes.ok) {
    const err = await searchRes.text();
    if (searchRes.status === 401) {
      return NextResponse.json({ error: "Token wygasł — zaloguj się ponownie" }, { status: 401 });
    }
    return NextResponse.json({ error: `Gmail error: ${err}` }, { status: searchRes.status });
  }

  const searchData = await searchRes.json();
  const messageIds: string[] = (searchData.messages || []).slice(0, 6).map((m: GmailMessage) => m.id);

  if (messageIds.length === 0) {
    return NextResponse.json({ emails: [], suggestion: null });
  }

  // Fetch subject + snippet for each message
  const emails = (
    await Promise.all(
      messageIds.map(async (id) => {
        const res = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!res.ok) return null;
        const msg = await res.json();
        const headers: GmailHeader[] = msg.payload?.headers || [];
        return {
          subject: headers.find((h) => h.name === "Subject")?.value || "",
          from: headers.find((h) => h.name === "From")?.value || "",
          snippet: (msg.snippet || "").replace(/&#39;/g, "'").replace(/&amp;/g, "&"),
        };
      })
    )
  ).filter(Boolean) as { subject: string; from: string; snippet: string }[];

  if (!emails.length || !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ emails, suggestion: null });
  }

  // Use Claude to analyze emails and suggest category
  const admin = getSupabaseAdmin();
  const { data: categoriesData } = await admin.from("finance_categories").select("id, name, type");
  const categories = categoriesData || [];
  const categoryList = categories
    .map((c) => `${c.id} | ${c.name}`)
    .join("\n");

  const emailSummary = emails
    .map((e, i) => `[${i + 1}] Od: ${e.from}\nTemat: ${e.subject}\nTreść: ${e.snippet}`)
    .join("\n\n");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: `Transakcja bankowa: "${merchant}" | ${amount} PLN | data: ${date}

Znalezione maile z tego okresu:
${emailSummary}

Kategorie:
${categoryList}

Czy któryś mail pasuje do tej transakcji? Jeśli tak, zaproponuj kategorię.
Odpowiedz TYLKO w JSON: {"categoryId": "uuid lub null", "note": "co znalazłeś"}`,
        },
      ],
    });

    const text = message.content[0]?.type === "text" ? message.content[0].text : "";
    const match = text.match(/\{[\s\S]*?\}/);
    const suggestion = match ? JSON.parse(match[0]) : null;
    const validSuggestion =
      suggestion?.categoryId && categories.some((c) => c.id === suggestion.categoryId)
        ? { categoryId: suggestion.categoryId, note: suggestion.note, importHash }
        : null;

    return NextResponse.json({ emails, suggestion: validSuggestion });
  } catch {
    return NextResponse.json({ emails, suggestion: null });
  }
}
