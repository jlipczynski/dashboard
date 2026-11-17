import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/finanse-db";
import { monthBounds } from "@/lib/finanse-coach";
import { todayWarsaw } from "@/lib/finanse-coach-server";

export const dynamic = "force-dynamic";

// Planned purchases for the current month ("Co jeszcze kupisz w tym miesiącu?").
// GET    → list for the current month
// POST   { name, amount, categoryId? } → add (current month)
// PATCH  { id, status: planned | bought | dropped }
// DELETE ?id=
const STATUSES = ["planned", "bought", "dropped"] as const;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

export async function GET() {
  const { from } = monthBounds(todayWarsaw());
  const { data, error } = await getSupabaseAdmin()
    .from("finance_planned_purchases")
    .select("id, month, name, amount, category_id, status")
    .eq("month", from)
    .order("created_at");
  if (error) return json({ error: error.message }, 500);
  return json({ planned: data ?? [] });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 100) : "";
  const amount = Number(body?.amount);
  if (!name) return json({ error: "Podaj nazwę" }, 400);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return json({ error: "Podaj kwotę większą od zera" }, 400);
  const categoryId = typeof body?.categoryId === "string" && body.categoryId ? body.categoryId : null;
  const { from } = monthBounds(todayWarsaw());
  const { data, error } = await getSupabaseAdmin()
    .from("finance_planned_purchases")
    .insert({ month: from, name, amount: (Math.round(amount * 100) / 100).toFixed(2), category_id: categoryId })
    .select("id, month, name, amount, category_id, status")
    .single();
  if (error) return json({ error: error.message }, 500);
  return json({ planned: data });
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const status = body?.status as (typeof STATUSES)[number];
  if (!id || !STATUSES.includes(status)) return json({ error: "Brak id lub nieznany status" }, 400);
  const { error } = await getSupabaseAdmin().from("finance_planned_purchases").update({ status }).eq("id", id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return json({ error: "Brak id" }, 400);
  const { error } = await getSupabaseAdmin().from("finance_planned_purchases").delete().eq("id", id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}
