import { NextResponse } from "next/server";
import { getSupabaseAdmin, ensureFinanceTables } from "@/lib/finanse-db";

// GET /api/finanse/subcategories?categoryId=...
export async function GET(request: Request) {
  await ensureFinanceTables();

  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("categoryId");

  const admin = getSupabaseAdmin();
  let query = admin
    .from("finance_subcategories")
    .select("id, name, category_id")
    .order("name");

  if (categoryId) query = query.eq("category_id", categoryId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ subcategories: data });
}

// POST /api/finanse/subcategories  { name, categoryId }
export async function POST(request: Request) {
  await ensureFinanceTables();

  const { name, categoryId } = await request.json();
  if (!name || !categoryId) return NextResponse.json({ error: "Missing name or categoryId" }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("finance_subcategories")
    .insert({ name: name.trim(), category_id: categoryId })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ subcategory: data });
}

// DELETE /api/finanse/subcategories?id=...
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { error } = await admin.from("finance_subcategories").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
