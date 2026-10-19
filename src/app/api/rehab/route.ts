import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/rehab?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns daily rehab entries in range (both optional).
 */
export async function GET(request: Request) {
  if (!supabase) {
    return NextResponse.json({ entries: [] });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  let query = supabase
    .from("rehab_entries")
    .select("date, percent, note")
    .order("date", { ascending: true });
  if (from && DATE_RE.test(from)) query = query.gte("date", from);
  if (to && DATE_RE.test(to)) query = query.lte("date", to);

  const { data, error } = await query;
  if (error) {
    if (error.message.includes("does not exist")) {
      return NextResponse.json({ entries: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entries: data ?? [] });
}

/**
 * POST /api/rehab { date, percent, note? }
 * Upserts the entry for that day.
 */
export async function POST(request: Request) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const body = await request.json();
  const date = body.date;
  const percent = Number(body.percent);

  if (typeof date !== "string" || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "Nieprawidlowa data" }, { status: 400 });
  }
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    return NextResponse.json({ error: "Procent musi byc liczba 0-100" }, { status: 400 });
  }

  const row: Record<string, unknown> = { date, percent, updated_at: new Date().toISOString() };
  if (typeof body.note === "string") row.note = body.note.trim() || null;

  const { error } = await supabase.from("rehab_entries").upsert(row, { onConflict: "date" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/rehab?date=YYYY-MM-DD
 */
export async function DELETE(request: Request) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const date = new URL(request.url).searchParams.get("date");
  if (!date || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "Nieprawidlowa data" }, { status: 400 });
  }

  const { error } = await supabase.from("rehab_entries").delete().eq("date", date);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
