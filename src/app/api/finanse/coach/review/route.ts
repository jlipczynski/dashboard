import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/finanse-db";
import { loadCoachState } from "@/lib/finanse-coach-server";

export const dynamic = "force-dynamic";

// POST /api/finanse/coach/review { commitment, previousKept?: "yes" | "no" | "partly", coachSummary? }
// Saves this week's review (week_start = Monday, Warsaw time) with the current month forecast
// and marks it completed. Re-running the same week overwrites it.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const commitment = typeof body?.commitment === "string" ? body.commitment.trim().slice(0, 300) : "";
  if (!commitment) return NextResponse.json({ error: "Wpisz jedno zobowiązanie na ten tydzień" }, { status: 400 });

  let state;
  try {
    state = await loadCoachState();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }

  const kept = body?.previousKept;
  const keptLine =
    state.lastCommitment && (kept === "yes" || kept === "no" || kept === "partly")
      ? `Poprzednie zobowiązanie („${state.lastCommitment.commitment}”): ${kept === "yes" ? "dotrzymane" : kept === "partly" ? "częściowo" : "niedotrzymane"}.`
      : null;
  const summary = [keptLine, typeof body?.coachSummary === "string" ? body.coachSummary.trim().slice(0, 2000) : null]
    .filter(Boolean)
    .join("\n") || null;

  const { data, error } = await getSupabaseAdmin()
    .from("finance_weekly_reviews")
    .upsert(
      {
        week_start: state.weekStart,
        month_forecast: state.status.forecast.toFixed(2),
        commitment,
        coach_summary: summary,
        completed_at: new Date().toISOString(),
      },
      { onConflict: "week_start" }
    )
    .select("week_start, month_forecast, commitment, completed_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, review: data });
}
