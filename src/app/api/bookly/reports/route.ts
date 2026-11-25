import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { saveReport, saveReports, validateReport, type BooklyReportInput } from "@/lib/bookly-db";

const COLUMNS = "id, period_from, period_to, minutes, pages, reading_days, books_finished, finished_titles, source, created_at";

/** GET /api/bookly/reports — all imported Bookly reports. */
export async function GET() {
  const supabase = getSupabaseAdmin();

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

/** POST /api/bookly/reports — save a (reviewed) report, or { reports: [...] } in one batch. */
export async function POST(request: Request) {
  const raw = (await request.json()) as Partial<BooklyReportInput> & { reports?: Partial<BooklyReportInput>[] };
  if (Array.isArray(raw.reports)) {
    if (raw.reports.length === 0 || raw.reports.length > 400) {
      return NextResponse.json({ error: "Nieprawidlowa liczba raportow" }, { status: 400 });
    }
    for (const r of raw.reports) {
      const bad = validateReport(r);
      if (bad) return NextResponse.json({ error: `${r.period_from ?? "?"}: ${bad}` }, { status: 400 });
    }
    try {
      await saveReports(raw.reports as BooklyReportInput[]);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Blad zapisu" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, saved: raw.reports.length });
  }
  const body = raw as Partial<BooklyReportInput>;
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
  const supabase = getSupabaseAdmin();
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Brak id" }, { status: 400 });
  const { error } = await supabase.from("bookly_reports").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
