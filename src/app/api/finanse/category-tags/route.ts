import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/finanse-db";

// GET /api/finanse/category-tags
// Returns { [categoryId]: { id, name }[] }
export async function GET() {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("finance_category_tags")
    .select("category_id, finance_tags(id, name)");

  if (error) return NextResponse.json({ categoryTags: {} });

  const map: Record<string, { id: string; name: string }[]> = {};
  for (const row of data || []) {
    const rawTag = row.finance_tags;
    const tag = Array.isArray(rawTag) ? rawTag[0] : rawTag;
    if (!tag || typeof tag !== "object" || !("id" in tag)) continue;
    const t = tag as { id: string; name: string };
    if (!map[row.category_id]) map[row.category_id] = [];
    map[row.category_id].push(t);
  }

  return NextResponse.json({ categoryTags: map });
}

// POST /api/finanse/category-tags  { categoryId, tagId }
export async function POST(request: Request) {
  const admin = getSupabaseAdmin();
  const { categoryId, tagId } = await request.json();
  if (!categoryId || !tagId) {
    return NextResponse.json({ error: "Missing categoryId or tagId" }, { status: 400 });
  }

  const { error } = await admin
    .from("finance_category_tags")
    .insert({ category_id: categoryId, tag_id: tagId });

  if (error && !error.message.includes("duplicate")) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

// DELETE /api/finanse/category-tags?categoryId=X&tagId=Y
export async function DELETE(request: Request) {
  const admin = getSupabaseAdmin();
  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("categoryId");
  const tagId = searchParams.get("tagId");
  if (!categoryId || !tagId) {
    return NextResponse.json({ error: "Missing categoryId or tagId" }, { status: 400 });
  }

  await admin
    .from("finance_category_tags")
    .delete()
    .eq("category_id", categoryId)
    .eq("tag_id", tagId);

  return NextResponse.json({ ok: true });
}
