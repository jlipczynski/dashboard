// SERVER-ONLY. Loads everything the coach needs (status, big expenses, plans, last commitment).
// Shared by /api/finanse/coach/status, /talk and /review so they all see the same numbers.
import { getSupabaseAdmin } from "@/lib/finanse-db";
import {
  monthStatus,
  monthBounds,
  bigExpensesToDiscuss,
  weekStartOf,
  type BigExpense,
  type CoachRow,
  type Goal,
  type GoalStatus,
  type MonthStatus,
} from "@/lib/finanse-coach";

const PAGE = 1000;
const COLS = "id, amount, category_id, subcategory_id, merchant, counterparty, description, date, one_off";

export function todayWarsaw(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(new Date());
}

export type Planned = {
  id: string;
  month: string;
  name: string;
  amount: number;
  category_id: string | null;
  status: "planned" | "bought" | "dropped";
};

export type Review = {
  week_start: string;
  month_forecast: number | null;
  commitment: string | null;
  coach_summary: string | null;
  completed_at: string | null;
};

export type CoachState = {
  today: string;
  weekStart: string;
  month: { from: string; to: string };
  goal: Goal & { key: string; status: GoalStatus; approved_at: string | null };
  status: MonthStatus;
  big: BigExpense[];
  planned: Planned[];
  thisWeek: Review | null;
  lastCommitment: Review | null; // most recent completed review before this week, with a commitment
  lastCompletedAt: string | null;
  discretionaryTop: { category: string; subcategory: string; amount: number }[];
  recentDecisions: { payee: string; amount: number; necessary: string; recurring: boolean; horizon_until: string | null; plan: string | null }[];
};

export async function loadCoachState(): Promise<CoachState> {
  const admin = getSupabaseAdmin();
  const today = todayWarsaw();
  const weekStart = weekStartOf(today);
  const { from, to } = monthBounds(today);

  const rows: CoachRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from("finance_transactions")
      .select(COLS)
      .is("deleted_at", null)
      .gte("date", from)
      .lte("date", to)
      .order("id")
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as CoachRow[]));
    if (!data || data.length < PAGE) break;
  }

  const [cats, subs, goals, planned, decisions, reviews] = await Promise.all([
    admin.from("finance_categories").select("id, name, type"),
    admin.from("finance_subcategories").select("id, name, category_id, kind"),
    admin.from("finance_goals").select("key, monthly_limit, counts, valid_from, status, approved_at").eq("key", "cost_of_living").lte("valid_from", today),
    admin.from("finance_planned_purchases").select("id, month, name, amount, category_id, status").eq("month", from).order("created_at"),
    admin.from("finance_expense_decisions").select("transaction_id, necessary, recurring, horizon_until, plan, created_at").order("created_at", { ascending: false }),
    admin.from("finance_weekly_reviews").select("week_start, month_forecast, commitment, coach_summary, completed_at").order("week_start", { ascending: false }).limit(10),
  ]);
  const err = cats.error || subs.error || goals.error || planned.error || decisions.error || reviews.error;
  if (err) throw new Error(err.message);

  const goalRow = goals.data?.[0];
  if (!goalRow) throw new Error("Brak celu cost_of_living w finance_goals");
  const goal = {
    key: goalRow.key as string,
    monthly_limit: Number(goalRow.monthly_limit),
    counts: goalRow.counts as Goal["counts"],
    status: (goalRow.status === "approved" ? "approved" : "pending") as GoalStatus,
    approved_at: (goalRow.approved_at as string | null) ?? null,
  };

  const plannedList = (planned.data ?? []).map((p) => ({ ...p, amount: Number(p.amount) })) as Planned[];
  const plannedRemaining = plannedList.filter((p) => p.status === "planned").reduce((s, p) => s + Math.round(p.amount * 100), 0) / 100;

  const categories = cats.data ?? [];
  const decided = new Set((decisions.data ?? []).map((d) => d.transaction_id as string));
  const status = monthStatus(rows, categories, (subs.data ?? []) as { id: string; kind: string | null }[], plannedRemaining, goal, today);
  const big = bigExpensesToDiscuss(rows, categories, decided);

  // Discretionary subcategories this month — hints for "what will you cut?"
  const subById = new Map((subs.data ?? []).map((s) => [s.id as string, s]));
  const catById = new Map(categories.map((c) => [c.id as string, c]));
  const disc = new Map<string, { category: string; subcategory: string; gr: number }>();
  for (const r of rows) {
    const s = r.subcategory_id ? subById.get(r.subcategory_id) : undefined;
    if (s?.kind !== "discretionary") continue;
    const key = s.id as string;
    const cur = disc.get(key) ?? { category: catById.get(s.category_id as string)?.name ?? "", subcategory: s.name as string, gr: 0 };
    cur.gr -= Math.round(Number(r.amount) * 100);
    disc.set(key, cur);
  }
  const discretionaryTop = [...disc.values()]
    .filter((d) => d.gr > 0)
    .sort((a, b) => b.gr - a.gr)
    .slice(0, 5)
    .map((d) => ({ category: d.category, subcategory: d.subcategory, amount: d.gr / 100 }));

  // Recent decisions with the payee (for the AI to refer back to)
  const recentIds = (decisions.data ?? []).slice(0, 5).map((d) => d.transaction_id as string);
  const { data: recentTx } = recentIds.length
    ? await admin.from("finance_transactions").select("id, amount, counterparty, merchant, description").in("id", recentIds)
    : { data: [] as { id: string; amount: number; counterparty: string | null; merchant: string | null; description: string }[] };
  const txById = new Map((recentTx ?? []).map((t) => [t.id as string, t]));
  const recentDecisions = (decisions.data ?? []).slice(0, 5).flatMap((d) => {
    const t = txById.get(d.transaction_id as string);
    if (!t) return [];
    return [{
      payee: (t.counterparty?.trim() || t.merchant?.trim() || t.description).slice(0, 60),
      amount: Math.abs(Number(t.amount)),
      necessary: d.necessary as string,
      recurring: !!d.recurring,
      horizon_until: (d.horizon_until as string | null) ?? null,
      plan: (d.plan as string | null) ?? null,
    }];
  });

  const all = (reviews.data ?? []) as Review[];
  const thisWeek = all.find((r) => r.week_start === weekStart) ?? null;
  const lastCommitment = all.find((r) => r.week_start < weekStart && r.completed_at && r.commitment) ?? null;
  const lastCompletedAt = all.map((r) => r.completed_at).filter(Boolean).sort().pop() ?? null;

  return {
    today,
    weekStart,
    month: { from, to },
    goal,
    status,
    big,
    planned: plannedList,
    thisWeek,
    lastCommitment,
    lastCompletedAt,
    discretionaryTop,
    recentDecisions,
  };
}
