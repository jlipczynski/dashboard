import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/finanse-db";
import { validateGoalPatch } from "@/lib/finanse-coach";

export const dynamic = "force-dynamic";

// Monthly spending limit (finance_goals, key cost_of_living).
// GET   → { goal, history }
// PATCH { monthlyLimit?, status?: "pending" | "approved" } → updates the value; every change is
//       appended to finance_goal_history (nothing is overwritten without a trace).
const KEY = "cost_of_living";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET() {
  const admin = getSupabaseAdmin();
  const [goal, history] = await Promise.all([
    admin.from("finance_goals").select("key, monthly_limit, counts, status, approved_at, updated_at").eq("key", KEY).maybeSingle(),
    admin.from("finance_goal_history").select("monthly_limit, status, note, changed_at").eq("goal_key", KEY).order("changed_at", { ascending: false }).limit(20),
  ]);
  if (goal.error || history.error) return json({ error: (goal.error ?? history.error)!.message }, 500);
  return json({ goal: goal.data, history: history.data ?? [] });
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const v = validateGoalPatch(body ?? {});
  if (!v.ok) return json({ error: v.error }, 400);

  const admin = getSupabaseAdmin();
  const { data: cur, error: curErr } = await admin.from("finance_goals").select("monthly_limit, status").eq("key", KEY).maybeSingle();
  if (curErr) return json({ error: curErr.message }, 500);
  if (!cur) return json({ error: "Brak limitu w bazie" }, 404);

  const status = v.value.status ?? cur.status;
  // A changed amount is a new proposal until Jan approves it explicitly.
  const changedAmount = v.value.monthly_limit !== undefined && Number(v.value.monthly_limit) !== Number(cur.monthly_limit);
  const nextStatus = changedAmount && v.value.status === undefined ? "pending" : status;
  const update = {
    ...(v.value.monthly_limit !== undefined ? { monthly_limit: v.value.monthly_limit } : {}),
    status: nextStatus,
    approved_at: nextStatus === "approved" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from("finance_goals").update(update).eq("key", KEY);
  if (error) return json({ error: error.message }, 500);

  const { error: hErr } = await admin.from("finance_goal_history").insert({
    goal_key: KEY,
    monthly_limit: v.value.monthly_limit ?? cur.monthly_limit,
    status: nextStatus,
    note: nextStatus === "approved" ? "zatwierdzony przez Jana" : changedAmount ? "zmiana kwoty (do zatwierdzenia)" : "status: do zatwierdzenia",
  });
  if (hErr) return json({ error: hErr.message }, 500);
  return json({ ok: true, status: nextStatus });
}
