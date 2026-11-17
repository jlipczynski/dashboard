import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/lib/finanse-db";
import { loadCoachState, loadKnowledge, type CoachState } from "@/lib/finanse-coach-server";
import { parseProposals, MAX_PROPOSALS } from "@/lib/finanse-insights";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PROPOSE_SYSTEM = `Jesteś coachem wydatków Jana. Po jego cotygodniowym przeglądzie proponujesz 0–${MAX_PROPOSALS} nowe wpisy do wiedzy o jego finansach.
Jan sam zdecyduje, czy je przyjąć — proponuj tylko rzeczy ważne i nowe (nie powtarzaj tego, co już jest na liście).
Rodzaje: "fact" (fakt z danych), "pattern" (powtarzalność w danych, min. 3 przypadki), "rule" lub "decision" (tylko jeśli Jan sam to powiedział w rozmowie).
Każdy wpis MUSI mieć dowód w danych: liczby, kwoty, daty, liczbę przypadków. Bez dowodu — nie proponuj.
Nie zgaduj psychologii (żadnego „kupujesz ze stresu”). Nie zapisuj danych zdrowotnych ani informacji o osobach trzecich poza nazwą odbiorcy i kwotą.
Odpowiedz WYŁĄCZNIE tablicą JSON: [{"kind":"pattern","text":"…po polsku, max 300 znaków…","evidence":{…}}]. Brak propozycji: [].`;

/** Best effort: one AI call after the review → 0–2 'proposed' insights. Never fails the review. */
async function proposeInsights(state: CoachState, sessionId: string | null, commitment: string): Promise<number> {
  if (!process.env.ANTHROPIC_API_KEY) return 0;
  const admin = getSupabaseAdmin();
  const [knowledge, all, talk] = await Promise.all([
    loadKnowledge(state),
    admin.from("finance_coach_insights").select("text"),
    sessionId
      ? admin.from("finance_coach_messages").select("role, step, content").eq("session_id", sessionId).order("created_at")
      : Promise.resolve({ data: [] as { role: string; step: string; content: string }[], error: null }),
  ]);
  const s = state.status;
  const prompt = [
    `Dziś ${state.today}. Wydane w miesiącu ${s.spent.toFixed(2)} zł, prognoza ${s.forecast.toFixed(2)} zł, limit ${s.limit.toFixed(2)} zł.`,
    `Wzorce w danych: ${knowledge.patterns.join(" | ") || "brak"}.`,
    `Decyzje o dużych wydatkach: ${state.recentDecisions.map((d) => `${d.payee} ${d.amount.toFixed(2)} zł, konieczny: ${d.necessary}${d.plan ? `, plan: ${d.plan}` : ""}`).join("; ") || "brak"}.`,
    `Zobowiązanie na ten tydzień: „${commitment}”.`,
    `Rozmowa z przeglądu: ${(talk.data ?? []).map((m) => `${m.role === "jan" ? "Jan" : "Coach"} (krok ${m.step}): ${m.content}`).join(" / ").slice(0, 4000) || "brak"}.`,
    `Już w wiedzy (nie powtarzaj): ${knowledge.insights.map((i) => i.text).join(" | ") || "nic"}.`,
  ].join("\n");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 600,
    system: PROPOSE_SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });
  const raw = message.content.find((c) => c.type === "text")?.text ?? "";
  const proposals = parseProposals(raw, (all.data ?? []).map((r) => r.text as string));
  if (!proposals.length) return 0;
  const { error } = await admin
    .from("finance_coach_insights")
    .insert(proposals.map((p) => ({ kind: p.kind, text: p.text, evidence: p.evidence, status: "proposed", source: "coach" })));
  if (error) throw new Error(error.message);
  return proposals.length;
}

// POST /api/finanse/coach/review { commitment, previousKept?: "yes" | "no" | "partly", coachSummary?, sessionId? }
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

  // Brief 10: after the review the coach proposes 0–2 insights for Jan to accept or reject (step 0 next time).
  let proposed = 0;
  try {
    const sessionId = typeof body?.sessionId === "string" && UUID_RE.test(body.sessionId) ? body.sessionId : null;
    proposed = await proposeInsights(state, sessionId, commitment);
  } catch (e) {
    console.error("[finanse/coach/review] proposals:", e instanceof Error ? e.message : "error");
  }
  return NextResponse.json({ ok: true, review: data, proposed });
}
