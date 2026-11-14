import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const ROW_ID = "default";

let tableReady = false;

async function ensureTable() {
  if (tableReady) return;
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("fitness_goals").select("id").limit(1);
  if (!error) {
    tableReady = true;
    return;
  }

  if (!error.message.includes("does not exist")) {
    tableReady = true;
    return;
  }

  // Brak tabeli — NIE tworzymy jej w runtime. Migracje tylko recznie (scripts/migrate.mjs).
}

export async function GET() {
  await ensureTable();
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("fitness_goals")
    .select("*")
    .eq("id", ROW_ID)
    .single();

  if (error && error.code === "PGRST116") {
    return NextResponse.json({ data: null });
  }
  if (error) {
    // If table doesn't exist, return null gracefully
    if (error.message.includes("does not exist")) {
      return NextResponse.json({ data: null });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  await ensureTable();
  const supabase = getSupabaseAdmin();
  const body = await request.json();

  const row = {
    id: ROW_ID,
    goals: body.goals ?? {},
    gym_days: body.gym_days ?? [false, false, false, false, false, false, false],
    gym_weekly_goal: body.gym_weekly_goal ?? 0,
    gym_monthly_goal: body.gym_monthly_goal ?? 0,
    gym_monthly_done: body.gym_monthly_done ?? 0,
    run_weekly_goal: body.run_weekly_goal ?? 0,
    run_monthly_goal: body.run_monthly_goal ?? 0,
    bike_weekly_goal: body.bike_weekly_goal ?? 0,
    bike_monthly_goal: body.bike_monthly_goal ?? 0,
    rozwoj_targets: body.rozwoj_targets ?? {},
    run_entries: body.run_entries ?? [0, 0, 0, 0, 0, 0, 0],
    bike_entries: body.bike_entries ?? [0, 0, 0, 0, 0, 0, 0],
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("fitness_goals")
    .upsert(row, { onConflict: "id" });

  if (error) {
    if (error.message.includes("does not exist")) {
      return NextResponse.json({
        error: "Tabela nie istnieje. Uruchom migracje: node --env-file=.env.local scripts/migrate.mjs",
      }, { status: 500 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// PATCH /api/goals — partial update (only changed fields)
const ALLOWED_COLUMNS = new Set([
  "goals", "gym_days", "gym_weekly_goal", "gym_monthly_goal",
  "gym_monthly_done", "run_weekly_goal", "run_monthly_goal",
  "bike_weekly_goal", "bike_monthly_goal", "rozwoj_targets",
  "run_entries", "bike_entries",
]);

export async function PATCH(request: Request) {
  await ensureTable();
  const supabase = getSupabaseAdmin();
  const body = await request.json();

  // Only allow known columns
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (ALLOWED_COLUMNS.has(key)) {
      updates[key] = value;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true }); // nothing to update
  }

  updates.updated_at = new Date().toISOString();

  // First ensure the row exists
  const { data: existing } = await supabase
    .from("fitness_goals")
    .select("id")
    .eq("id", ROW_ID)
    .single();

  if (!existing) {
    // Row doesn't exist — create with only the provided fields
    const { error } = await supabase
      .from("fitness_goals")
      .insert({ id: ROW_ID, ...updates });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    // Row exists — update only the changed fields
    const { error } = await supabase
      .from("fitness_goals")
      .update(updates)
      .eq("id", ROW_ID);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
