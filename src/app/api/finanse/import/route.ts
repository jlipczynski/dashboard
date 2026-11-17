import { NextResponse } from "next/server";
import { matchRule, sortRules } from "@/lib/finanse-rules";
import { planEmailMatches, toGrosze, cardLast4, MATCH_WINDOW_DAYS } from "@/lib/finanse-email-match";
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
    .select("pattern, counterparty_pattern, created_at, category_id, subcategory_id, finance_categories(id, name, type), finance_subcategories(id, name)");

  // Most specific rule wins: recipient + title first, then longer patterns; deterministic order (sortRules).
  const rules = sortRules(
    (rulesData || []).map((r) => ({
      pattern: r.pattern as string,
      counterparty_pattern: (r.counterparty_pattern as string | null) ?? null,
      created_at: (r.created_at as string | null) ?? null,
      categoryId: r.category_id as string,
      categoryName: (r.finance_categories as unknown as { name: string } | null)?.name || "",
      subcategoryId: r.subcategory_id as string | null,
      subcategoryName: (r.finance_subcategories as unknown as { name: string } | null)?.name || null,
    }))
  );

  // Check which hashes already exist in DB (deduplication).
  // Deliberately NO deleted_at filter: a transaction moved to the trash must still count as
  // existing, otherwise re-importing the same period would bring it back.
  const hashes = parsed.map((t) => t.importHash);
  const { data: existingData } = await admin
    .from("finance_transactions")
    .select("import_hash, deleted_at")
    .in("import_hash", hashes);

  const existingHashes = new Set((existingData || []).map((r) => r.import_hash as string));
  const trashedHashes = new Set(
    (existingData || []).filter((r) => r.deleted_at).map((r) => r.import_hash as string)
  );

  // Match rules against each transaction
  function matchRules(description: string, merchant: string, counterparty: string | null) {
    const rule = matchRule(rules, { description, merchant, counterparty });
    return rule
      ? { categoryId: rule.categoryId, categoryName: rule.categoryName, subcategoryId: rule.subcategoryId, subcategoryName: rule.subcategoryName }
      : null;
  }

  const transactions = parsed.map((t) => {
    const isDuplicate = existingHashes.has(t.importHash);
    const isOpaque = t.intermediary?.kind === "opaque";
    // Opaque intermediary: a rule would match many different shops — leave for lookup instead.
    const match = !isDuplicate && !isOpaque ? matchRules(t.description, t.merchant, t.counterparty) : null;

    return {
      ...t,
      isDuplicate,
      inTrash: trashedHashes.has(t.importHash),
      categoryId: match?.categoryId || null,
      categoryName: match?.categoryName || null,
      subcategoryId: match?.subcategoryId || null,
      subcategoryName: match?.subcategoryName || null,
      aiSuggested: false,
      needsLookup: isOpaque && !isDuplicate,
      needsAi: !isDuplicate && !match?.categoryId && !isOpaque,
    };
  });

  // Rows that will merge into a transaction which already came in from an Erste e-mail alert
  // (the actual update happens on save, in POST /api/finanse/transactions — same planEmailMatches).
  const freshTx = transactions.filter((t) => !t.isDuplicate);
  const emailMatched = new Set<string>();
  if (freshTx.length > 0) {
    const dates = freshTx.map((t) => t.date).sort();
    const shift = (iso: string, d: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
    const { data: emailRows } = await admin
      .from("finance_transactions")
      .select("id, date, amount, balance, counterparty, description")
      .eq("source", "email")
      .gte("date", shift(dates[0], -MATCH_WINDOW_DAYS))
      .lte("date", shift(dates[dates.length - 1], MATCH_WINDOW_DAYS));
    if (emailRows && emailRows.length > 0) {
      const plan = planEmailMatches(
        freshTx.map((t) => ({
          date: t.date,
          amountGrosze: toGrosze(t.amount),
          balanceGrosze: t.balance == null ? null : toGrosze(t.balance),
          counterparty: t.counterparty,
          title: t.description,
          cardLast4: cardLast4(t.description),
        })),
        emailRows.map((e) => ({
          id: e.id as string,
          date: e.date as string,
          amountGrosze: toGrosze(e.amount as string),
          balanceGrosze: e.balance == null ? null : toGrosze(e.balance as string),
          counterparty: (e.counterparty as string | null) ?? null,
          title: (e.description as string | null) ?? null,
          cardLast4: cardLast4(e.description as string | null),
        }))
      );
      plan.forEach((d, i) => d.action === "update" && emailMatched.add(freshTx[i].importHash));
    }
  }

  // AI category suggestions are fetched afterwards, in batches, by the client (/api/finanse/suggest),
  // so the preview returns immediately.

  const newTx = transactions.filter((t) => !t.isDuplicate);
  const stats = {
    total: transactions.length,
    new: newTx.length,
    duplicates: transactions.length - newTx.length,
    inTrash: transactions.filter((t) => t.inTrash).length,
    autoCategorized: newTx.filter((t) => t.categoryId && !t.aiSuggested).length,
    aiSuggested: newTx.filter((t) => t.aiSuggested).length,
    needsReview: newTx.filter((t) => !t.categoryId).length,
    needsLookup: newTx.filter((t) => t.needsLookup).length,
    needsAi: newTx.filter((t) => t.needsAi).length,
    emailMatched: emailMatched.size,
  };

  return NextResponse.json({ transactions, stats });
}
