import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { dedupeSessions, type BooklySession } from "@/lib/bookly-sessions";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type BooklyReportInput = {
  period_from: string;
  period_to: string;
  minutes: number;
  pages: number;
  reading_days: number;
  books_finished: number;
  finished_titles?: string[];
  source?: string;
  drive_file_id?: string;
};

export function validateReport(b: Partial<BooklyReportInput>): string | null {
  if (!b.period_from || !DATE_RE.test(b.period_from)) return "Nieprawidlowa data poczatkowa";
  if (!b.period_to || !DATE_RE.test(b.period_to)) return "Nieprawidlowa data koncowa";
  if (b.period_to < b.period_from) return "Data koncowa przed poczatkowa";
  for (const k of ["minutes", "pages", "reading_days", "books_finished"] as const) {
    const v = b[k];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0) return `Nieprawidlowa wartosc: ${k}`;
  }
  return null;
}

function toRow(b: BooklyReportInput) {
  return {
    period_from: b.period_from,
    period_to: b.period_to,
    minutes: b.minutes,
    pages: b.pages,
    reading_days: b.reading_days,
    books_finished: b.books_finished,
    finished_titles: b.finished_titles ?? [],
    source: b.source ?? "upload",
    ...(b.drive_file_id ? { drive_file_id: b.drive_file_id } : {}),
    updated_at: new Date().toISOString(),
  };
}

/** Upsert by period (same range imported again replaces the previous one). */
export async function saveReport(b: BooklyReportInput) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("bookly_reports").upsert(toRow(b), { onConflict: "period_from,period_to" });
  if (error) throw new Error(error.message);
}

/**
 * Insert sessions; ones already stored (same date, title, pages, seconds —
 * e.g. the card repeated on the next screenshot) are skipped.
 */
export async function saveSessions(
  sessions: BooklySession[],
  opts: { source: "drive" | "upload"; drive_file_id?: string }
): Promise<{ inserted: number; duplicates: number }> {
  const unique = dedupeSessions(sessions);
  if (unique.length === 0) return { inserted: 0, duplicates: sessions.length };
  const supabase = getSupabaseAdmin();
  const rows = unique.map((s) => ({
    date: s.date,
    title: s.title,
    author: s.author || null,
    pages: s.pages,
    seconds: s.seconds,
    source: opts.source,
    drive_file_id: opts.drive_file_id ?? null,
  }));
  const { data, error } = await supabase
    .from("bookly_sessions")
    .upsert(rows, { onConflict: "date,title,pages,seconds", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(error.message);
  const inserted = data?.length ?? 0;
  return { inserted, duplicates: sessions.length - inserted };
}
