import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/finanse-db";
import { isValidIsoDate } from "@/lib/finanse-summary";
import { buildDashboard, addDays, type DashRow } from "@/lib/finanse-dashboard";

export const dynamic = "force-dynamic";

const PAGE = 1000; // Supabase returns at most 1000 rows per request
const COLS = "amount, category_id, subcategory_id, merchant, counterparty, description, date, one_off, reviewed_at";

/** Today's date in Jan's time zone (the server runs in UTC). */
function todayWarsaw(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(new Date());
}

// GET /api/finanse/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD
// Everything the /finanse/dashboard page shows, aggregated on the server.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!isValidIsoDate(from) || !isValidIsoDate(to) || from > to) {
    return NextResponse.json({ error: "Nieprawidłowy okres (from/to: YYYY-MM-DD, from ≤ to)" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const [cats, subs] = await Promise.all([
    admin.from("finance_categories").select("id, name, type, icon, color, sort_order"),
    admin.from("finance_subcategories").select("id, name, category_id, kind"),
  ]);
  if (cats.error) return NextResponse.json({ error: cats.error.message }, { status: 500 });
  if (subs.error) return NextResponse.json({ error: subs.error.message }, { status: 500 });

  async function load(a: string, b: string): Promise<DashRow[] | string> {
    const out: DashRow[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await admin
        .from("finance_transactions")
        .select(COLS)
        .is("deleted_at", null)
        .gte("date", a)
        .lte("date", b)
        .order("id")
        .range(offset, offset + PAGE - 1);
      if (error) return error.message;
      out.push(...((data ?? []) as DashRow[]));
      if (!data || data.length < PAGE) break;
    }
    return out;
  }

  const today = todayWarsaw();
  const [rows, recent] = await Promise.all([load(from, to), load(addDays(today, -13), today)]);
  if (typeof rows === "string") return NextResponse.json({ error: rows }, { status: 500 });
  if (typeof recent === "string") return NextResponse.json({ error: recent }, { status: 500 });

  // Review status across all time (not only the period): what is waiting for the weekly session.
  const [unrev, lastRev, lastTx] = await Promise.all([
    admin.from("finance_transactions").select("id", { count: "exact", head: true }).is("deleted_at", null).is("reviewed_at", null),
    admin.from("finance_transactions").select("reviewed_at").not("reviewed_at", "is", null).order("reviewed_at", { ascending: false }).limit(1),
    admin.from("finance_transactions").select("date").is("deleted_at", null).order("date", { ascending: false }).limit(1),
  ]);

  return NextResponse.json({
    from,
    to,
    today,
    ...buildDashboard(rows, recent, cats.data ?? [], subs.data ?? [], today),
    unreviewedTotal: unrev.count ?? 0,
    lastReviewedAt: lastRev.data?.[0]?.reviewed_at ?? null,
    lastTransactionDate: lastTx.data?.[0]?.date ?? null,
  });
}
