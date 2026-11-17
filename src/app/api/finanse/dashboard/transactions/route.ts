import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/finanse-db";
import { isValidIsoDate, payeeName } from "@/lib/finanse-summary";
import { drilldown, NONE, type DashRow } from "@/lib/finanse-dashboard";

export const dynamic = "force-dynamic";

const PAGE = 1000; // Supabase returns at most 1000 rows per request
const COLS = "id, amount, category_id, subcategory_id, merchant, counterparty, description, date, one_off";

type Row = DashRow & { id: string };

// GET /api/finanse/dashboard/transactions?from&to&categoryId&subcategoryId?&payee?
// The transactions behind one row of the dashboard (category / subcategory / "Najwięcej u"), newest first.
// categoryId / subcategoryId "__none__" = "Bez kategorii" / "Bez podkategorii".
// `total` comes from the same function as the tile (summarizeExpenses), so it equals the row's amount.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const categoryId = searchParams.get("categoryId");
  const subcategoryId = searchParams.get("subcategoryId");
  const payee = searchParams.get("payee");
  if (!isValidIsoDate(from) || !isValidIsoDate(to) || from > to) {
    return NextResponse.json({ error: "Nieprawidłowy okres (from/to: YYYY-MM-DD, from ≤ to)" }, { status: 400 });
  }
  if (!categoryId) return NextResponse.json({ error: "Brak categoryId" }, { status: 400 });

  const admin = getSupabaseAdmin();
  const [cats, subs] = await Promise.all([
    admin.from("finance_categories").select("id, name, type"),
    admin.from("finance_subcategories").select("id, name, category_id, kind"),
  ]);
  if (cats.error) return NextResponse.json({ error: cats.error.message }, { status: 500 });
  if (subs.error) return NextResponse.json({ error: subs.error.message }, { status: 500 });

  // Narrow in the DB by category; the exact membership (incl. "Bez kategorii") is decided by drilldown().
  const rows: Row[] = [];
  for (let offset = 0; ; offset += PAGE) {
    let q = admin.from("finance_transactions").select(COLS).is("deleted_at", null).gte("date", from).lte("date", to);
    if (categoryId !== NONE) q = q.eq("category_id", categoryId);
    const { data, error } = await q.order("id").range(offset, offset + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < PAGE) break;
  }

  const { rows: picked, total } = drilldown(rows, cats.data ?? [], subs.data ?? [], { categoryId, subcategoryId, payee });
  return NextResponse.json({
    total,
    count: picked.length,
    transactions: picked.map((r) => ({
      id: r.id,
      date: r.date,
      amount: Number(r.amount),
      payee: payeeName(r),
      title: (r.description ?? "").replace(/\b(?:PL)?\d{2}(?:[  ]?\d{4}){6}\b/g, "…").slice(0, 80),
      one_off: !!r.one_off,
    })),
  });
}
