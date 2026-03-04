import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { runMigrationSQL, hasDbUrl } from "@/lib/db";

const ROW_ID = "default";

const MIGRATION_005_SQL = `
CREATE TABLE IF NOT EXISTS fitness_goals (
  id TEXT PRIMARY KEY DEFAULT 'default',
  goals JSONB NOT NULL DEFAULT '{}',
  gym_days JSONB NOT NULL DEFAULT '[false,false,false,false,false,false,false]',
  gym_weekly_goal NUMERIC DEFAULT 0,
  gym_monthly_goal NUMERIC DEFAULT 0,
  gym_monthly_done NUMERIC DEFAULT 0,
  run_weekly_goal NUMERIC DEFAULT 0,
  run_monthly_goal NUMERIC DEFAULT 0,
  bike_weekly_goal NUMERIC DEFAULT 0,
  bike_monthly_goal NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE fitness_goals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Allow all on fitness_goals" ON fitness_goals
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
`;

const MIGRATION_007_SQL = `
ALTER TABLE fitness_goals ADD COLUMN IF NOT EXISTS rozwoj_targets JSONB NOT NULL DEFAULT '{"czytanie":{"monthly":300,"weekly":75},"sluchanie":{"monthly":600,"weekly":150},"pisanie":{"monthly":30,"weekly":8}}';
ALTER TABLE fitness_goals ADD COLUMN IF NOT EXISTS run_entries JSONB NOT NULL DEFAULT '[0,0,0,0,0,0,0]';
ALTER TABLE fitness_goals ADD COLUMN IF NOT EXISTS bike_entries JSONB NOT NULL DEFAULT '[0,0,0,0,0,0,0]';
`;

let tableReady = false;

async function ensureTable() {
  if (tableReady || !supabase) return;

  const { error } = await supabase.from("fitness_goals").select("id").limit(1);
  if (!error) {
    tableReady = true;
    return;
  }

  if (!error.message.includes("does not exist")) {
    tableReady = true;
    return;
  }

  // Table missing — create via direct Postgres
  if (hasDbUrl()) {
    try {
      await runMigrationSQL("005_fitness_goals.sql", MIGRATION_005_SQL);
      await runMigrationSQL("007_fitness_goals_extras.sql", MIGRATION_007_SQL);
      tableReady = true;
    } catch {
      // ignore
    }
  }
}

export async function GET() {
  if (!supabase) {
    return NextResponse.json({ data: null });
  }

  await ensureTable();

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
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  await ensureTable();

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
        error: "Tabela nie istnieje. Wejdz na /api/migrate zeby ja utworzyc.",
      }, { status: 500 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
