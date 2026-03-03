import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * Ensure the rozwoj_entries table exists.
 * Uses Supabase RPC if available, otherwise tries a simple query first.
 */
async function ensureTable() {
  if (!supabase) return;
  // Try a simple query — if it fails with "relation does not exist", create the table
  const { error } = await supabase.from("rozwoj_entries").select("id").limit(1);
  if (error && error.message.includes("does not exist")) {
    // Table doesn't exist — create it via raw SQL RPC
    try {
      await supabase.rpc("run_sql", {
        sql: `
          CREATE TABLE IF NOT EXISTS rozwoj_entries (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            area TEXT NOT NULL CHECK (area IN ('czytanie', 'sluchanie', 'pisanie')),
            date DATE NOT NULL,
            amount INT NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now(),
            UNIQUE(area, date)
          );
          ALTER TABLE rozwoj_entries ENABLE ROW LEVEL SECURITY;
          DO $$ BEGIN
            CREATE POLICY "Allow all on rozwoj_entries" ON rozwoj_entries
              FOR ALL USING (true) WITH CHECK (true);
          EXCEPTION WHEN duplicate_object THEN NULL;
          END $$;
          CREATE INDEX IF NOT EXISTS idx_rozwoj_entries_area_date ON rozwoj_entries (area, date DESC);
        `,
      });
    } catch { /* run_sql RPC may not exist — table needs to be created via /api/migrate */ }
  }
}

let tableChecked = false;

async function checkTable() {
  if (tableChecked) return;
  await ensureTable();
  tableChecked = true;
}

// GET /api/rozwoj?area=czytanie&days=90
// Returns entries for a given area, last N days (default 90)
export async function GET(request: Request) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  await checkTable();

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

  await checkTable();

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

  await checkTable();

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
