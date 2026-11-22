import { NextResponse } from "next/server";
import pg from "pg";
import { addDaysIso, todayWarsaw } from "@/lib/dates";
import { CHECKIN_UPSERT_SQL, checkinParams } from "@/lib/praca-checkin";

const dbUrl = process.env.DATABASE_POOLER_URL || process.env.DATABASE_URL;

function getClient() {
  if (!dbUrl) throw new Error("No DATABASE_URL configured");
  return new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
}

export const dynamic = "force-dynamic";

/**
 * GET /api/praca?days=31
 * Returns work check-ins for the last N days + weeks that have tasks in weekly_tasks.
 * Dates are returned as text (to_char) — no JS Date, so no time-zone shift.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") || "31", 10);

  const client = getClient();
  await client.connect();
  try {
    const sinceStr = addDaysIso(todayWarsaw(), -(Number.isFinite(days) ? days : 31));

    // Get check-ins
    const { rows: checkins } = await client.query(
      `SELECT to_char(date, 'YYYY-MM-DD') AS date, daily_plan, weekly_review, notes FROM work_checkins WHERE date >= $1 ORDER BY date DESC`,
      [sinceStr]
    );

    // Weeks that have a plan. weekly_goals was replaced by weekly_tasks (the table no longer exists).
    const { rows: weeksWithGoals } = await client.query(
      `SELECT DISTINCT to_char(week_start, 'YYYY-MM-DD') AS week_start FROM weekly_tasks WHERE week_start >= $1 ORDER BY 1`,
      [sinceStr]
    );

    return NextResponse.json({
      checkins: checkins.map((r) => ({
        date: r.date as string,
        dailyPlan: r.daily_plan,
        weeklyReview: r.weekly_review,
        notes: r.notes || "",
      })),
      weeksWithGoals: weeksWithGoals.map((r) => r.week_start as string),
    });
  } finally {
    await client.end();
  }
}

/**
 * POST /api/praca
 * Body: { date, dailyPlan?, weeklyReview?, notes? }
 * Upserts a check-in for the given date. Fields not in the body are left unchanged.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = checkinParams(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const client = getClient();
  await client.connect();
  try {
    const { rows } = await client.query(CHECKIN_UPSERT_SQL, parsed.params);

    return NextResponse.json({
      checkin: {
        date: rows[0].date as string,
        dailyPlan: rows[0].daily_plan,
        weeklyReview: rows[0].weekly_review,
        notes: rows[0].notes,
      },
    });
  } finally {
    await client.end();
  }
}
