import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin, ensureFinanceTables, parseSantanderCSV } from "@/lib/finanse-db";
import { classifyIntermediary } from "@/lib/finanse-intermediaries";

// POST /api/finanse/import  { content: string }
// Parses CSV, matches rules, returns preview (does NOT save to DB)
export async function POST(request: Request) {
  await ensureFinanceTables();

  const { content } = await request.json();
  if (!content) return NextResponse.json({ error: "Missing content" }, { status: 400 });

  const admin = getSupabaseAdmin();
  // Payment intermediaries: strip "PAYPAL *"-style prefixes; mark opaque ones (PayU, PayPro…) for lookup.
  // importHash stays computed from the original description (dedup of existing rows).
  const parsed = parseSantanderCSV(content).map((t) => {
    const info = classifyIntermediary(t.description, t.counterparty, t.merchant);
    return {
      ...t,
      merchant: info.kind === "prefixed" ? info.cleanMerchant : t.merchant,
      intermediary: info.kind ? { kind: info.kind, provider: info.provider } : null,
    };
  });

  // Load all rules
  const { data: rulesData } = await admin
    .from("finance_rules")
    .select("pattern, category_id, subcategory_id, finance_categories(id, name, type), finance_subcategories(id, name)");

  const rules: { pattern: string; categoryId: string; categoryName: string; subcategoryId: string | null; subcategoryName: string | null }[] =
    (rulesData || []).map((r) => ({
      pattern: r.pattern as string,
      categoryId: r.category_id as string,
      categoryName: (r.finance_categories as unknown as { name: string } | null)?.name || "",
      subcategoryId: r.subcategory_id as string | null,
      subcategoryName: (r.finance_subcategories as unknown as { name: string } | null)?.name || null,
    }));

  // Check which hashes already exist in DB (deduplication)
  const hashes = parsed.map((t) => t.importHash);
  const { data: existingData } = await admin
    .from("finance_transactions")
    .select("import_hash")
    .in("import_hash", hashes);

  const existingHashes = new Set((existingData || []).map((r) => r.import_hash as string));

  // Match rules against each transaction
  function matchRules(description: string, merchant: string, counterparty: string | null) {
    const haystack = `${description} ${merchant} ${counterparty || ""}`.toUpperCase();
    for (const rule of rules) {
      if (haystack.includes(rule.pattern)) {
        return { categoryId: rule.categoryId, categoryName: rule.categoryName, subcategoryId: rule.subcategoryId, subcategoryName: rule.subcategoryName };
      }
    }
    return null;
  }

  const transactions = parsed.map((t) => {
    const isDuplicate = existingHashes.has(t.importHash);
    const isOpaque = t.intermediary?.kind === "opaque";
    // Opaque intermediary: a rule would match many different shops — leave for lookup instead.
    const match = !isDuplicate && !isOpaque ? matchRules(t.description, t.merchant, t.counterparty) : null;

    return {
      ...t,
      isDuplicate,
      categoryId: match?.categoryId || null,
      categoryName: match?.categoryName || null,
      subcategoryId: match?.subcategoryId || null,
      subcategoryName: match?.subcategoryName || null,
      aiSuggested: false,
      needsLookup: isOpaque && !isDuplicate,
    };
  });

  // AI suggestions for new, uncategorized transactions
  const uncategorized = transactions.filter((t) => !t.isDuplicate && !t.categoryId && !t.needsLookup);
  if (uncategorized.length > 0 && process.env.ANTHROPIC_API_KEY) {
    try {
      const { data: categoriesData } = await admin
        .from("finance_categories")
        .select("id, name, type")
        .order("name");

      const categoryList = (categoriesData || [])
        .map((c) => `${c.id} | ${c.name} (${c.type === "expense" ? "wydatek" : "przychód"})`)
        .join("\n");

      const txList = uncategorized
        .map((t, i) => `${i + 1}. [${t.importHash}] ${t.amount > 0 ? "+" : ""}${t.amount} PLN | ${t.merchant}${t.counterparty ? ` | ${t.counterparty}` : ""}`)
        .join("\n");

      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Przypisz każdą transakcję do najlepiej pasującej kategorii.

KATEGORIE (id | nazwa | typ):
${categoryList}

TRANSAKCJE (numer. [hash] kwota | merchant | kontrahent):
${txList}

Odpowiedz TYLKO w formacie JSON, tablica obiektów: [{"hash": "...", "categoryId": "..."}]
Jeśli nie jesteś pewny, wybierz najbardziej pasującą. Nie pomijaj żadnej transakcji.`,
          },
        ],
      });

      const raw = message.content[0].type === "text" ? message.content[0].text : "";
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const suggestions: { hash: string; categoryId: string }[] = JSON.parse(jsonMatch[0]);
        const suggestionMap = new Map(suggestions.map((s) => [s.hash, s.categoryId]));
        const categoryMap = new Map((categoriesData || []).map((c) => [c.id, c.name]));

        for (const tx of transactions) {
          if (!tx.isDuplicate && !tx.categoryId && !tx.needsLookup && suggestionMap.has(tx.importHash)) {
            const suggestedId = suggestionMap.get(tx.importHash)!;
            tx.categoryId = suggestedId;
            tx.categoryName = categoryMap.get(suggestedId) || null;
            tx.aiSuggested = true;
          }
        }
      }
    } catch {
      // AI suggestions optional — continue without them
    }
  }

  const newTx = transactions.filter((t) => !t.isDuplicate);
  const stats = {
    total: transactions.length,
    new: newTx.length,
    duplicates: transactions.length - newTx.length,
    autoCategorized: newTx.filter((t) => t.categoryId && !t.aiSuggested).length,
    aiSuggested: newTx.filter((t) => t.aiSuggested).length,
    needsReview: newTx.filter((t) => !t.categoryId).length,
    needsLookup: newTx.filter((t) => t.needsLookup).length,
  };

  return NextResponse.json({ transactions, stats });
}
