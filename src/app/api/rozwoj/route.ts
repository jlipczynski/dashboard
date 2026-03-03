import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET /api/rozwoj?area=czytanie&days=90
// Returns entries for a given area, last N days (default 90)
export async function GET(request: Request) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const area = searchParams.get("area"); // optional filter
  const days = parseInt(searchParams.get("days") || "90");

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split("T")[0];

  let query = supabase
    .from("rozwoj_entries")
    .select("*")
    .gte("date", sinceStr)
    .order("date", { ascending: false });

  if (area) {
    query = query.eq("area", area);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entries: data });
}

// POST /api/rozwoj
// Upsert a daily entry: { area, date, amount }
export async function POST(request: Request) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const body = await request.json();
  const { area, date, amount } = body;

  if (!area || !date || amount === undefined) {
    return NextResponse.json({ error: "Missing area, date, or amount" }, { status: 400 });
  }

  const { error } = await supabase
    .from("rozwoj_entries")
    .upsert(
      { area, date, amount, updated_at: new Date().toISOString() },
      { onConflict: "area,date" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/rozwoj?id=...
export async function DELETE(request: Request) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const { error } = await supabase
    .from("rozwoj_entries")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
