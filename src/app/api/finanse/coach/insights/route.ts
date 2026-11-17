import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/finanse-db";
import { STATUSES, validateInsightPatch, insightUpdate, type InsightStatus } from "@/lib/finanse-insights";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const COLS = "id, kind, text, evidence, status, valid_until, source, created_at, decided_at";

// GET /api/finanse/coach/insights?status=accepted (default) | proposed | rejected | retired
// The coach's knowledge about Jan (brief Finanse 10).
export async function GET(request: Request) {
  const status = (new URL(request.url).searchParams.get("status") ?? "accepted") as InsightStatus;
  if (!STATUSES.includes(status)) return json({ error: "Nieznany status" }, 400);
  const { data, error } = await getSupabaseAdmin()
    .from("finance_coach_insights")
    .select(COLS)
    .eq("status", status)
    .order("created_at", { ascending: false });
  if (error) return json({ error: error.message }, 500);
  return json({ insights: data ?? [] });
}

// PATCH { id, action: "accept" | "reject" | "retire" | "edit", text? } — only Jan's decisions change an entry.
export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const v = validateInsightPatch(body ?? {});
  if (!v.ok) return json({ error: v.error }, 400);

  const admin = getSupabaseAdmin();
  const { data: cur, error: curErr } = await admin.from("finance_coach_insights").select("status").eq("id", v.value.id).maybeSingle();
  if (curErr) return json({ error: curErr.message }, 500);
  if (!cur) return json({ error: "Nie ma takiego wpisu" }, 404);

  const u = insightUpdate(cur.status as InsightStatus, v.value, new Date().toISOString());
  if (!u.ok) return json({ error: u.error }, 409);
  const { data, error } = await admin.from("finance_coach_insights").update(u.update).eq("id", v.value.id).select(COLS).single();
  if (error) return json({ error: error.message }, 500);
  return json({ insight: data });
}
