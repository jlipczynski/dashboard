import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/finanse-db";
import { loadCoachState } from "@/lib/finanse-coach-server";
import { buildLesson, LESSON_DAYS, type LessonRow } from "@/lib/finanse-lessons";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// POST /api/finanse/coach/lesson → { lesson: { title, text } | null }
// "Lekcja tygodnia" (brief Finanse 10, step 3), shown after the review is completed. One per week: a second call
// returns the same lesson. Saved as an insight kind='lesson' (source 'analysis') — the history of lessons is what
// keeps them from repeating; lessons are not sent to the coach as knowledge about Jan.
export async function POST() {
  let state;
  try {
    state = await loadCoachState();
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
  const admin = getSupabaseAdmin();

  const { data: past, error: pastErr } = await admin
    .from("finance_coach_insights")
    .select("text, evidence, created_at")
    .eq("kind", "lesson")
    .order("created_at", { ascending: false });
  if (pastErr) return json({ error: pastErr.message }, 500);
  const thisWeek = (past ?? []).find((p) => (p.evidence as { week_start?: string } | null)?.week_start === state.weekStart);
  if (thisWeek) return json({ lesson: splitLesson(thisWeek.text as string) });

  const from = addDays(state.today, -(LESSON_DAYS - 1));
  const [rows, cats, subs] = await Promise.all([
    admin
      .from("finance_transactions")
      .select("date, amount, category_id, subcategory_id, merchant, counterparty, description, one_off")
      .is("deleted_at", null)
      .gte("date", from)
      .lte("date", state.today)
      .limit(1000),
    admin.from("finance_categories").select("id, name, type"),
    admin.from("finance_subcategories").select("id, kind"),
  ]);
  const err = rows.error || cats.error || subs.error;
  if (err) return json({ error: err.message }, 500);

  const lesson = buildLesson({
    rows: (rows.data ?? []) as LessonRow[],
    categories: cats.data ?? [],
    subcategories: subs.data ?? [],
    today: state.today,
    used: (past ?? []).map((p) => ({ principle: String((p.evidence as { principle?: string } | null)?.principle ?? ""), at: p.created_at as string })),
  });
  if (!lesson) return json({ lesson: null });

  const now = new Date().toISOString();
  const { error } = await admin.from("finance_coach_insights").insert({
    kind: "lesson",
    text: `${lesson.title}: ${lesson.text}`,
    evidence: { ...lesson.evidence, week_start: state.weekStart },
    status: "accepted",
    source: "analysis",
    decided_at: now,
  });
  if (error) return json({ error: error.message }, 500);
  return json({ lesson: { title: lesson.title, text: lesson.text } });
}

function splitLesson(text: string): { title: string; text: string } {
  const i = text.indexOf(": ");
  return i > 0 ? { title: text.slice(0, i), text: text.slice(i + 2) } : { title: "Lekcja tygodnia", text };
}
