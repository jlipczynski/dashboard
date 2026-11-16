import { NextResponse } from "next/server";
import { getSupabaseAdmin, ensureFinanceTables } from "@/lib/finanse-db";
import { normalizeRule, validateRule } from "@/lib/finanse-rules";

// GET /api/finanse/rules
export async function GET() {
  await ensureFinanceTables();

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("finance_rules")
    .select("*, finance_categories(name, type), finance_subcategories(name)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rules: data });
}

// POST /api/finanse/rules  { pattern, counterpartyPattern?, categoryId, subcategoryId? }
// Transfer rules: pattern = title + counterpartyPattern = recipient (both must match on import).
// A pattern-only rule that is too general (PRZELEW, JAN, < 4 chars…) is rejected with 400.
export async function POST(request: Request) {
  await ensureFinanceTables();

  const { pattern, counterpartyPattern, categoryId, subcategoryId } = await request.json();
  if (!pattern || !categoryId) return NextResponse.json({ error: "Missing pattern or categoryId" }, { status: 400 });

  const rule = normalizeRule(String(pattern), counterpartyPattern ? String(counterpartyPattern) : null);
  const invalid = validateRule(rule.pattern, rule.counterparty_pattern);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const admin = getSupabaseAdmin();
  const payload: Record<string, string | null> = {
    pattern: rule.pattern,
    counterparty_pattern: rule.counterparty_pattern,
    category_id: categoryId,
    subcategory_id: subcategoryId || null,
  };
  const { data, error } = await admin
    .from("finance_rules")
    .upsert(payload, { onConflict: "pattern,counterparty_pattern" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rule: data });
}

// DELETE /api/finanse/rules?id=...
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { error } = await admin.from("finance_rules").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
