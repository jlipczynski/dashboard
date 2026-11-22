// /api/praca check-in: which fields a POST really changes.
// The page sends ONE flag per click ({date, dailyPlan} or {date, weeklyReview}). A flag that is not
// in the body must stay as it is in the DB, so it is passed to SQL as NULL (→ COALESCE keeps the
// stored value). Before the fix a missing flag became `false` and wiped the other flag.

export type CheckinBody = { date?: unknown; dailyPlan?: unknown; weeklyReview?: unknown; notes?: unknown };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const flag = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

/** SQL parameters [$1 date, $2 daily_plan, $3 weekly_review, $4 notes]; null = "leave unchanged". */
export function checkinParams(body: CheckinBody): { ok: true; params: [string, boolean | null, boolean | null, string | null] } | { ok: false; error: string } {
  if (typeof body.date !== "string" || !DATE_RE.test(body.date)) return { ok: false, error: "date is required (YYYY-MM-DD)" };
  return { ok: true, params: [body.date, flag(body.dailyPlan), flag(body.weeklyReview), typeof body.notes === "string" ? body.notes : null] };
}

/** Upsert: a new row gets false / "" for missing fields; an existing row keeps them. */
export const CHECKIN_UPSERT_SQL = `INSERT INTO work_checkins (date, daily_plan, weekly_review, notes, updated_at)
       VALUES ($1, COALESCE($2, false), COALESCE($3, false), COALESCE($4, ''), now())
       ON CONFLICT (date) DO UPDATE SET
         daily_plan = COALESCE($2, work_checkins.daily_plan),
         weekly_review = COALESCE($3, work_checkins.weekly_review),
         notes = COALESCE($4, work_checkins.notes),
         updated_at = now()
       RETURNING to_char(date, 'YYYY-MM-DD') AS date, daily_plan, weekly_review, notes`;
