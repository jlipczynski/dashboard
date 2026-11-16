import { NextResponse } from "next/server";
import { categoryTypeLabel } from "@/lib/finanse-suggest";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/lib/finanse-db";

type TxInput = {
  importHash: string;
  merchant: string;
  amount: number;
  description: string;
  counterparty: string | null;
};

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "No API key" }, { status: 500 });
  }

  const { transactions }: { transactions: TxInput[] } = await request.json();
  if (!transactions?.length) return NextResponse.json({ suggestions: {} });

  const admin = getSupabaseAdmin();
  const { data: categoriesData } = await admin
    .from("finance_categories")
    .select("id, name, type");

  const categories = categoriesData || [];
  const categoryList = categories
    .map((c) => `${c.id} | ${c.name} (${categoryTypeLabel(c.type)})`)
    .join("\n");

  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    defaultHeaders: { "anthropic-beta": "web-search-2025-03-05" },
  });

  const suggestions: Record<string, { categoryId: string; note: string }> = {};

  // Process max 3 at a time to avoid Vercel timeout
  const CONCURRENCY = 3;
  for (let i = 0; i < transactions.length; i += CONCURRENCY) {
    const batch = transactions.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (tx) => {
        try {
          const message = await client.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 512,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            tools: [{ type: "web_search_20250305", name: "web_search" } as any],
            messages: [
              {
                role: "user",
                content: `Zidentyfikuj co to za firma i przypisz do kategorii finansowej.

Merchant/opis: "${tx.merchant}"${tx.counterparty ? `\nKontrahent: "${tx.counterparty}"` : ""}
Kwota: ${tx.amount} PLN

Jeśli nie znasz tej firmy — przeszukaj internet żeby ustalić co robi. Np. "Łazienki Chodzieskie" → szukaj → restauracja → "Jedzenie na zewnątrz".

Kategorie (id | nazwa):
${categoryList}

Odpowiedz TYLKO w formacie JSON (bez markdown): {"categoryId": "uuid", "note": "krótkie uzasadnienie po polsku"}`,
              },
            ],
          });

          const textContent = message.content.find((c) => c.type === "text");
          if (textContent?.type === "text") {
            const match = textContent.text.match(/\{[\s\S]*?\}/);
            if (match) {
              const parsed = JSON.parse(match[0]);
              if (parsed.categoryId && categories.some((c) => c.id === parsed.categoryId)) {
                suggestions[tx.importHash] = { categoryId: parsed.categoryId, note: parsed.note || "" };
              }
            }
          }
        } catch {
          // Skip on error
        }
      })
    );
  }

  return NextResponse.json({ suggestions });
}
