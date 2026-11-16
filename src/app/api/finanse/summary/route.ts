import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/finanse-db";
import { summarizeExpenses, isValidIsoDate, type SummaryRow } from "@/lib/finanse-summary";

export const dynamic = "force-dynamic";

const PAGE = 1000; // Supabase returns at most 1000 rows per request

// GET /api/finanse/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
// Expenses by category for the home page card — aggregated here, so the page never downloads raw transactions.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!isValidIsoDate(from) || !isValidIsoDate(to) || from > to) {
    return NextResponse.json({ error: "Nieprawidłowy okres (from/to: YYYY-MM-DD, from ≤ to)" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const { data: categories, error: catError } = await admin.from("finance_categories").select("id, name, type");
  if (catError) return NextResponse.json({ error: catError.message }, { status: 500 });

  const rows: SummaryRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from("finance_transactions")
      .select("amount, category_id, merchant, counterparty, description, date")
      .is("deleted_at", null)
      .gte("date", from)
      .lte("date", to)
      .order("id")
      .range(offset, offset + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows.push(...((data ?? []) as SummaryRow[]));
    if (!data || data.length < PAGE) break;
  }

  return NextResponse.json({ from, to, ...summarizeExpenses(rows, categories ?? []) });
}
