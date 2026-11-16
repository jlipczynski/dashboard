import { NextResponse } from "next/server";
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
      needsAi: !isDuplicate && !match?.categoryId && !isOpaque,
    };
  });

  // AI category suggestions are fetched afterwards, in batches, by the client (/api/finanse/suggest),
  // so the preview returns immediately.

  const newTx = transactions.filter((t) => !t.isDuplicate);
  const stats = {
    total: transactions.length,
    new: newTx.length,
    duplicates: transactions.length - newTx.length,
    autoCategorized: newTx.filter((t) => t.categoryId && !t.aiSuggested).length,
    aiSuggested: newTx.filter((t) => t.aiSuggested).length,
    needsReview: newTx.filter((t) => !t.categoryId).length,
    needsLookup: newTx.filter((t) => t.needsLookup).length,
    needsAi: newTx.filter((t) => t.needsAi).length,
  };

  return NextResponse.json({ transactions, stats });
}
