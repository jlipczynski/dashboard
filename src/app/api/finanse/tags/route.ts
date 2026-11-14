import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/finanse-db";

export async function GET() {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("finance_tags")
    .select("id, name")
    .order("name");

  if (error) return NextResponse.json({ tags: [] });
  return NextResponse.json({ tags: data || [] });
}

export async function POST(request: Request) {
  const admin = getSupabaseAdmin();
  const { name } = await request.json();
  if (!name?.trim()) return NextResponse.json({ error: "Missing name" }, { status: 400 });

  const { data, error } = await admin
    .from("finance_tags")
    .insert({ name: name.trim() })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ tag: data });
}

export async function DELETE(request: Request) {
  const admin = getSupabaseAdmin();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await admin.from("finance_tags").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
