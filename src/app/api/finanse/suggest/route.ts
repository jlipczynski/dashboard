import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/lib/finanse-db";
import {
  SUGGEST_BATCH_MAX,
  buildSuggestPrompt,
  parseSuggestResponse,
  type SuggestInput,
} from "@/lib/finanse-suggest";

export const maxDuration = 60;

// POST /api/finanse/suggest  { transactions: { key, amount, merchant, counterparty }[] }  (max 40)
// Returns AI category suggestions — does NOT save anything.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const txs = body?.transactions;

  if (!Array.isArray(txs) || txs.length === 0) {
    return NextResponse.json({ error: "Brak transakcji" }, { status: 400 });
  }
  if (txs.length > SUGGEST_BATCH_MAX) {
    return NextResponse.json({ error: `Maksymalnie ${SUGGEST_BATCH_MAX} transakcji w partii` }, { status: 400 });
  }
  const validInput = txs.every(
    (t: Partial<SuggestInput>) =>
      typeof t?.key === "string" &&
      typeof t.amount === "number" &&
      typeof t.merchant === "string" &&
      (t.counterparty === null || t.counterparty === undefined || typeof t.counterparty === "string")
  );
  if (!validInput) {
    return NextResponse.json({ error: "Nieprawidłowe transakcje" }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ suggestions: {}, rejected: 0, error: "no_api_key" });
  }

  const input = txs as SuggestInput[];
  const admin = getSupabaseAdmin();
  const { data: categoriesData, error: catError } = await admin
    .from("finance_categories")
    .select("id, name, type")
    .order("name");
  if (catError) {
    return NextResponse.json({ error: catError.message }, { status: 500 });
  }
  const categories = categoriesData || [];

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    temperature: 0,
    messages: [{ role: "user", content: buildSuggestPrompt(categories, input) }],
  });

  const raw = message.content.find((c) => c.type === "text")?.text ?? "";
  const parsed = parseSuggestResponse(raw, input.length, new Set(categories.map((c) => c.id)));
  if (!parsed.ok) {
    console.error("[finanse/suggest] parse error", {
      stop_reason: message.stop_reason,
      raw: raw.slice(0, 300),
    });
    return NextResponse.json({ suggestions: {}, rejected: 0, error: "parse" });
  }

  const suggestions: Record<string, string> = {};
  for (const [i, categoryId] of parsed.byIndex) {
    suggestions[input[i - 1].key] = categoryId;
  }
  return NextResponse.json({ suggestions, rejected: parsed.rejected });
}
