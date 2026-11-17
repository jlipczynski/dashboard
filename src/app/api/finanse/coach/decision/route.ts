import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/finanse-db";
import { validateDecision } from "@/lib/finanse-coach";

export const dynamic = "force-dynamic";

// POST /api/finanse/coach/decision
// { transactionId, necessary: yes|partly|no, recurring: boolean, horizonUntil?: YYYY-MM-DD, plan?: string }
// One decision per transaction (a second POST overwrites it).
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const v = validateDecision(body ?? {});
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const { error } = await getSupabaseAdmin()
    .from("finance_expense_decisions")
    .upsert(v.value, { onConflict: "transaction_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
