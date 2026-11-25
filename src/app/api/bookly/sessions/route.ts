import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { saveSessions } from "@/lib/bookly-db";
import { sessionError, type BooklySession } from "@/lib/bookly-sessions";
import { todayWarsaw } from "@/lib/dates";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COLUMNS = "id, date, title, author, pages, seconds, source, created_at";

/**
 * GET /api/bookly/sessions?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Sessions sorted date desc, created_at desc. Without params: current year.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const year = todayWarsaw().slice(0, 4);
  const from = url.searchParams.get("from") ?? `${year}-01-01`;
  const to = url.searchParams.get("to") ?? `${year}-12-31`;
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return NextResponse.json({ error: "Nieprawidlowy zakres dat" }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("bookly_sessions")
    .select(COLUMNS)
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) {
    if (error.message.includes("does not exist") || error.message.includes("schema cache")) {
      return NextResponse.json({ sessions: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ sessions: data ?? [] });
}

/** POST /api/bookly/sessions { sessions: [...] } — save a reviewed list from a manual upload. */
export async function POST(request: Request) {
  const body = (await request.json()) as { sessions?: Partial<BooklySession>[] };
  if (!Array.isArray(body.sessions) || body.sessions.length === 0 || body.sessions.length > 500) {
    return NextResponse.json({ error: "Brak sesji do zapisu" }, { status: 400 });
  }
  const today = todayWarsaw();
  const clean: BooklySession[] = [];
  for (const raw of body.sessions) {
    const s = {
      date: raw.date,
      title: typeof raw.title === "string" ? raw.title.trim() : raw.title,
      author: typeof raw.author === "string" ? raw.author.trim() : "",
      pages: raw.pages,
      seconds: raw.seconds,
    } as BooklySession;
    const err = sessionError(s, today);
    if (err) return NextResponse.json({ error: `${s.date ?? "?"} ${s.title ?? ""}: ${err}` }, { status: 400 });
    clean.push(s);
  }
  try {
    return NextResponse.json(await saveSessions(clean, { source: "upload" }));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Blad zapisu" }, { status: 500 });
  }
}

/** DELETE /api/bookly/sessions?id=… */
export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Brak id" }, { status: 400 });
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("bookly_sessions").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
