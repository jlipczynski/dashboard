import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { ensureFinanceTables } from "@/lib/finanse-db";

// GET /api/finanse/rules
export async function GET() {
  if (!supabase) return NextResponse.json({ rules: [] });

  await ensureFinanceTables();

  const { data, error } = await supabase
    .from("finance_rules")
    .select("*, finance_categories(name, type)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rules: data });
}

// POST /api/finanse/rules  { pattern, categoryId }
export async function POST(request: Request) {
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  await ensureFinanceTables();

  const { pattern, categoryId } = await request.json();
  if (!pattern || !categoryId) return NextResponse.json({ error: "Missing pattern or categoryId" }, { status: 400 });

  const { data, error } = await supabase
    .from("finance_rules")
    .upsert({ pattern: pattern.toUpperCase(), category_id: categoryId }, { onConflict: "pattern" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rule: data });
}

// DELETE /api/finanse/rules?id=...
export async function DELETE(request: Request) {
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabase.from("finance_rules").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
