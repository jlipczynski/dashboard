import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/finanse-db";
import { validateScenario } from "@/lib/finanse-wolnosc";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

// GET /api/finanse/wolnosc/scenarios — Jan's saved simulations, newest first.
export async function GET() {
  const { data, error } = await getSupabaseAdmin()
    .from("finance_freedom_scenarios")
    .select("id, name, params, data_source, created_at")
    .order("created_at", { ascending: false });
  if (error) return json({ error: error.message }, 500);
  return json({ scenarios: data ?? [] });
}

// POST { name, params, dataSource } — saves a NEW scenario (never overwrites an existing one).
// Only this table is written; real financial data is never touched.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const v = validateScenario(body ?? {});
  if (!v.ok) return json({ error: v.error }, 400);
  const { data, error } = await getSupabaseAdmin()
    .from("finance_freedom_scenarios")
    .insert(v.value)
    .select("id, name, params, data_source, created_at")
    .single();
  if (error) return json({ error: error.message }, 500);
  return json({ scenario: data });
}
