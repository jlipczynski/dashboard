import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { loadCoachState } from "@/lib/finanse-coach-server";
import { buildCoachPrompt, COACH_SYSTEM, type CoachStep } from "@/lib/finanse-coach";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/finanse/coach/talk { step: 2..5, transactionId?, answer? } → { text }
// The context is built on the server from the DB (the client sends only the step and Jan's answer).
// The AI gets payee, amount, category and date — never account numbers or full descriptions.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const step = Number(body?.step) as CoachStep;
  if (![2, 3, 4, 5].includes(step)) return NextResponse.json({ error: "Nieznany krok" }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Brak klucza AI" }, { status: 503 });

  let state;
  try {
    state = await loadCoachState();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }

  const big = step === 2 ? state.big.find((b) => b.id === body?.transactionId) ?? null : null;
  if (step === 2 && !big) return NextResponse.json({ error: "Ten wydatek nie czeka na omówienie" }, { status: 404 });

  const prompt = buildCoachPrompt(
    step,
    {
      today: state.today,
      status: state.status,
      limitApproved: state.goal.status === "approved",
      big,
      planned: state.planned,
      discretionaryTop: state.discretionaryTop,
      lastCommitment: state.lastCommitment?.commitment ?? null,
      recentDecisions: state.recentDecisions,
    },
    typeof body?.answer === "string" ? body.answer : undefined
  );

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      system: COACH_SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });
    const text = message.content.find((c) => c.type === "text")?.text?.trim() ?? "";
    return NextResponse.json({ text });
  } catch (e) {
    console.error("[finanse/coach/talk] AI error:", e instanceof Error ? e.name : "unknown");
    return NextResponse.json({ error: "Coach chwilowo niedostępny — spróbuj ponownie" }, { status: 502 });
  }
}
