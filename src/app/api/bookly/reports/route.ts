import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { saveReport, validateReport, type BooklyReportInput } from "@/lib/bookly-db";

const COLUMNS = "id, period_from, period_to, minutes, pages, reading_days, books_finished, finished_titles, source, created_at";

/** GET /api/bookly/reports — all imported Bookly reports. */
export async function GET() {
  if (!supabase) return NextResponse.json({ reports: [] });

  const { data, error } = await supabase
    .from("bookly_reports")
    .select(COLUMNS)
    .order("period_from", { ascending: true })
    .order("period_to", { ascending: true });

  if (error) {
    if (error.message.includes("does not exist") || error.message.includes("schema cache")) {
      return NextResponse.json({ reports: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ reports: data ?? [] });
}

/** POST /api/bookly/reports — save a (reviewed) report. */
export async function POST(request: Request) {
  const body = (await request.json()) as Partial<BooklyReportInput>;
  const invalid = validateReport(body);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  try {
    await saveReport(body as BooklyReportInput);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Blad zapisu" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** DELETE /api/bookly/reports?id=… */
export async function DELETE(request: Request) {
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Brak id" }, { status: 400 });
  const { error } = await supabase.from("bookly_reports").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
