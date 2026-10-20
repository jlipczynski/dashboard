import { supabase } from "@/lib/supabase";

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

/** Upsert by period (same range imported again replaces the previous one). */
export async function saveReport(b: BooklyReportInput) {
  if (!supabase) throw new Error("Supabase not configured");
  const row = {
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
  const { error } = await supabase.from("bookly_reports").upsert(row, { onConflict: "period_from,period_to" });
  if (error) throw new Error(error.message);
}
