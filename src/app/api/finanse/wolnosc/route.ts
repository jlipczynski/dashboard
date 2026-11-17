import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/finanse-db";
import { summarizeExpenses } from "@/lib/finanse-summary";
import { computeDefaults, type MonthTotal } from "@/lib/finanse-wolnosc";

export const dynamic = "force-dynamic";

const START = "2026-11"; // monitoring of finances starts in November 2026
const PAGE = 1000;
const pad = (n: number) => String(n).padStart(2, "0");
const todayWarsaw = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(new Date());

// GET /api/finanse/wolnosc — default values for "Moja liczba wolności". READ ONLY: nothing is written.
// Expenses: closed months since 11.2026 that are complete (every transaction reviewed and categorized),
// measured with the ONE definition of expenses (summarizeExpenses). The current month never counts.
export async function GET() {
  const admin = getSupabaseAdmin();
  const today = todayWarsaw();
  const current = today.slice(0, 7);

  const rows: { amount: string; category_id: string | null; merchant: string | null; counterparty: string | null; description: string; date: string; reviewed_at: string | null }[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from("finance_transactions")
      .select("amount, category_id, merchant, counterparty, description, date, reviewed_at")
      .is("deleted_at", null)
      .gte("date", `${START}-01`)
      .lt("date", `${current}-01`)
      .order("date")
      .range(offset, offset + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  const [cats, goal] = await Promise.all([
    admin.from("finance_categories").select("id, name, type"),
    admin.from("finance_goals").select("monthly_limit, status").eq("key", "cost_of_living").maybeSingle(),
  ]);
  if (cats.error) return NextResponse.json({ error: cats.error.message }, { status: 500 });

  // Closed months from START to the previous month
  const months: MonthTotal[] = [];
  for (let [y, m] = START.split("-").map(Number); `${y}-${pad(m)}` < current; m === 12 ? ((y += 1), (m = 1)) : (m += 1)) {
    const key = `${y}-${pad(m)}`;
    const inMonth = rows.filter((r) => r.date.startsWith(key));
    const complete = inMonth.length > 0 && inMonth.every((r) => r.reviewed_at && r.category_id);
    months.push({ month: key, total: summarizeExpenses(inMonth, cats.data ?? []).total, complete });
  }
  const limit = goal.data?.status === "approved" ? Number(goal.data.monthly_limit) : null;
  return NextResponse.json(
    {
      today,
      defaults: computeDefaults(months, limit),
      dataSource: { asOf: today, closedMonths: months.map((m) => ({ month: m.month, complete: m.complete })) },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
