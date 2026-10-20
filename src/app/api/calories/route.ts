import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/calories?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Daily calories from nutrition_log (shared with MFP CSV import).
 */
export async function GET(request: Request) {
  if (!supabase) {
    return NextResponse.json({ entries: [] });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  let query = supabase
    .from("nutrition_log")
    .select("date, calories")
    .order("date", { ascending: true });
  if (from && DATE_RE.test(from)) query = query.gte("date", from);
  if (to && DATE_RE.test(to)) query = query.lte("date", to);

  const { data, error } = await query;
  if (error) {
    if (error.message.includes("does not exist") || error.message.includes("schema cache")) {
      return NextResponse.json({ entries: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entries: data ?? [] });
}

/**
 * POST /api/calories { date, calories }
 * Manual daily entry — upserts only the calories column (MFP macros stay intact).
 */
export async function POST(request: Request) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const body = await request.json();
  const date = body.date;
  const calories = Number(body.calories);

  if (typeof date !== "string" || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "Nieprawidlowa data" }, { status: 400 });
  }
  if (!Number.isInteger(calories) || calories < 0 || calories > 10000) {
    return NextResponse.json({ error: "Kalorie musza byc liczba 0-10000" }, { status: 400 });
  }

  const { error } = await supabase
    .from("nutrition_log")
    .upsert({ date, calories }, { onConflict: "date" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
