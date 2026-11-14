import { NextResponse } from "next/server";
import { getSupabaseAdmin, ensureFinanceTables } from "@/lib/finanse-db";

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

// POST /api/finanse/rules  { pattern, categoryId, subcategoryId? }
export async function POST(request: Request) {
  await ensureFinanceTables();

  const { pattern, categoryId, subcategoryId } = await request.json();
  if (!pattern || !categoryId) return NextResponse.json({ error: "Missing pattern or categoryId" }, { status: 400 });

  const admin = getSupabaseAdmin();
  const payload: Record<string, string | null> = {
    pattern: pattern.toUpperCase(),
    category_id: categoryId,
    subcategory_id: subcategoryId || null,
  };
  const { data, error } = await admin
    .from("finance_rules")
    .upsert(payload, { onConflict: "pattern" })
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
