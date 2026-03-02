import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const ROW_ID = "default";

export async function GET() {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("fitness_goals")
    .select("*")
    .eq("id", ROW_ID)
    .single();

  if (error && error.code === "PGRST116") {
    // No row yet — return empty defaults
    return NextResponse.json({ data: null });
  }
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

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
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("fitness_goals")
    .upsert(row, { onConflict: "id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
