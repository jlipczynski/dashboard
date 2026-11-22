import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { addDaysIso, todayWarsaw } from "@/lib/dates";

let tableReady = false;

async function ensureTable() {
  if (tableReady) return;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("rozwoj_entries").select("id").limit(1);
  if (!error) {
    tableReady = true;
    return;
  }

  if (!error.message.includes("does not exist")) {
    tableReady = true;
    return;
  }

  // Brak tabeli — NIE tworzymy jej w runtime. Migracje tylko recznie (scripts/migrate.mjs).
}

// GET /api/rozwoj?area=czytanie&days=90
export async function GET(request: Request) {
  const supabase = getSupabaseAdmin();

  await ensureTable();

  const { searchParams } = new URL(request.url);
  const area = searchParams.get("area");
  const days = parseInt(searchParams.get("days") || "90");

  const sinceStr = addDaysIso(todayWarsaw(), -days);

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
    // If table still doesn't exist, return empty instead of crashing
    if (error.message.includes("does not exist")) {
      return NextResponse.json({
        entries: [],
        warning: "Tabela rozwoj_entries nie istnieje. Uruchom migracje: node --env-file=.env.local scripts/migrate.mjs",
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entries: data });
}

// POST /api/rozwoj
export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();

  await ensureTable();

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
    if (error.message.includes("does not exist")) {
      return NextResponse.json({
        error: "Tabela nie istnieje. Uruchom migracje: node --env-file=.env.local scripts/migrate.mjs",
      }, { status: 500 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/rozwoj?id=...
export async function DELETE(request: Request) {
  const supabase = getSupabaseAdmin();

  await ensureTable();

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
