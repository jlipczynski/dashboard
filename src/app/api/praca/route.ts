import { NextResponse } from "next/server";
import pg from "pg";

const dbUrl = process.env.DATABASE_POOLER_URL || process.env.DATABASE_URL;

function getClient() {
  if (!dbUrl) throw new Error("No DATABASE_URL configured");
  return new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
}

export const dynamic = "force-dynamic";

/**
 * GET /api/praca?days=31
 * Returns work check-ins for the last N days + weekly_goals existence per week
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") || "31", 10);

  const client = getClient();
  await client.connect();
  try {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split("T")[0];

    // Get check-ins
    const { rows: checkins } = await client.query(
      `SELECT date, daily_plan, weekly_review, notes FROM work_checkins WHERE date >= $1 ORDER BY date DESC`,
      [sinceStr]
    );

    // Get weeks that have goals (from existing weekly_goals table)
    const { rows: weeksWithGoals } = await client.query(
      `SELECT DISTINCT week_start FROM weekly_goals WHERE week_start >= $1 ORDER BY week_start`,
      [sinceStr]
    );

    return NextResponse.json({
      checkins: checkins.map((r) => ({
        date: r.date instanceof Date ? r.date.toISOString().split("T")[0] : String(r.date).split("T")[0],
        dailyPlan: r.daily_plan,
        weeklyReview: r.weekly_review,
        notes: r.notes || "",
      })),
      weeksWithGoals: weeksWithGoals.map((r) =>
        r.week_start instanceof Date ? r.week_start.toISOString().split("T")[0] : String(r.week_start).split("T")[0]
      ),
    });
  } finally {
    await client.end();
  }
}

/**
 * POST /api/praca
 * Body: { date, dailyPlan, weeklyReview, notes }
 * Upserts a check-in for the given date
 */
export async function POST(req: Request) {
  const body = await req.json();
  const { date, dailyPlan, weeklyReview, notes } = body;

  if (!date) {
    return NextResponse.json({ error: "date is required" }, { status: 400 });
  }

  const client = getClient();
  await client.connect();
  try {
    const { rows } = await client.query(
      `INSERT INTO work_checkins (date, daily_plan, weekly_review, notes, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (date) DO UPDATE SET
         daily_plan = COALESCE($2, work_checkins.daily_plan),
         weekly_review = COALESCE($3, work_checkins.weekly_review),
         notes = COALESCE($4, work_checkins.notes),
         updated_at = now()
       RETURNING date, daily_plan, weekly_review, notes`,
      [date, dailyPlan ?? false, weeklyReview ?? false, notes ?? ""]
    );

    return NextResponse.json({
      checkin: {
        date: rows[0].date instanceof Date ? rows[0].date.toISOString().split("T")[0] : String(rows[0].date).split("T")[0],
        dailyPlan: rows[0].daily_plan,
        weeklyReview: rows[0].weekly_review,
        notes: rows[0].notes,
      },
    });
  } finally {
    await client.end();
  }
}
