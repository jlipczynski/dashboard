import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { ensureFinanceTables, parseSantanderCSV } from "@/lib/finanse-db";

// POST /api/finanse/import  { content: string }
// Parses CSV, matches rules, returns preview (does NOT save to DB)
export async function POST(request: Request) {
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  await ensureFinanceTables();

  const { content } = await request.json();
  if (!content) return NextResponse.json({ error: "Missing content" }, { status: 400 });

  const parsed = parseSantanderCSV(content);

  // Load all rules
  const { data: rulesData } = await supabase
    .from("finance_rules")
    .select("pattern, category_id, finance_categories(id, name, type)");

  const rules: { pattern: string; categoryId: string; categoryName: string }[] =
    (rulesData || []).map((r) => ({
      pattern: r.pattern as string,
      categoryId: r.category_id as string,
      categoryName: (r.finance_categories as unknown as { name: string } | null)?.name || "",
    }));

  // Check which hashes already exist in DB (deduplication)
  const hashes = parsed.map((t) => t.importHash);
  const { data: existingData } = await supabase
    .from("finance_transactions")
    .select("import_hash")
    .in("import_hash", hashes);

  const existingHashes = new Set((existingData || []).map((r) => r.import_hash as string));

  // Match rules against each transaction
  function matchRules(description: string, merchant: string, counterparty: string | null) {
    const haystack = `${description} ${merchant} ${counterparty || ""}`.toUpperCase();
    for (const rule of rules) {
      if (haystack.includes(rule.pattern)) {
        return { categoryId: rule.categoryId, categoryName: rule.categoryName };
      }
    }
    return null;
  }

  const transactions = parsed.map((t) => {
    const isDuplicate = existingHashes.has(t.importHash);
    const match = !isDuplicate ? matchRules(t.description, t.merchant, t.counterparty) : null;

    return {
      ...t,
      isDuplicate,
      categoryId: match?.categoryId || null,
      categoryName: match?.categoryName || null,
    };
  });

  const newTx = transactions.filter((t) => !t.isDuplicate);
  const stats = {
    total: transactions.length,
    new: newTx.length,
    duplicates: transactions.length - newTx.length,
    autoCategorized: newTx.filter((t) => t.categoryId).length,
    needsReview: newTx.filter((t) => !t.categoryId).length,
  };

  return NextResponse.json({ transactions, stats });
}
