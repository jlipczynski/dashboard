import { NextResponse } from "next/server";
import { getSupabaseAdmin, ensureFinanceTables } from "@/lib/finanse-db";

// GET /api/finanse/categories
export async function GET() {
  await ensureFinanceTables();

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("finance_categories")
    .select("*")
    .order("type")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ categories: data });
}

// POST /api/finanse/categories  { name, type }
export async function POST(request: Request) {
  await ensureFinanceTables();

  const { name, type } = await request.json();
  if (!name || !type) return NextResponse.json({ error: "Missing name or type" }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("finance_categories")
    .insert({ name, type })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ category: data });
}

// DELETE /api/finanse/categories?id=...
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { error } = await admin.from("finance_categories").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
