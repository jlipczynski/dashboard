import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * POST /api/rehab/reset { from, before }
 * Deletes rehab_entries and nutrition_log rows with from <= date < before.
 * Used when starting the rehab plan over (old plan window only).
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const from = body?.from;
  const before = body?.before;

  if (typeof from !== "string" || !DATE_RE.test(from) || typeof before !== "string" || !DATE_RE.test(before)) {
    return NextResponse.json({ error: "Nieprawidlowa data" }, { status: 400 });
  }
  if (from >= before) {
    return NextResponse.json({ error: "from musi byc przed before" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const rehab = await supabase
    .from("rehab_entries")
    .delete({ count: "exact" })
    .gte("date", from)
    .lt("date", before);
  if (rehab.error) {
    console.log("[rehab/reset]", { from, before, error: rehab.error.message, rehabDeleted: false });
    return NextResponse.json(
      { error: rehab.error.message, rehabDeleted: false },
      { status: 500 }
    );
  }

  const calories = await supabase
    .from("nutrition_log")
    .delete({ count: "exact" })
    .gte("date", from)
    .lt("date", before);
  if (calories.error) {
    console.log("[rehab/reset]", { from, before, error: calories.error.message, rehabDeleted: true, rehab: rehab.count });
    return NextResponse.json(
      { error: calories.error.message, rehabDeleted: true, deleted: { rehab: rehab.count ?? 0 } },
      { status: 500 }
    );
  }

  const deleted = { rehab: rehab.count ?? 0, calories: calories.count ?? 0 };
  console.log("[rehab/reset]", { from, before, deleted });
  return NextResponse.json({ ok: true, deleted });
}
