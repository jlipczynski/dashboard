import { NextResponse } from "next/server";
import { getSupabaseAdmin, ensureFinanceTables } from "@/lib/finanse-db";

// GET /api/finanse/export?month=2026-03
export async function GET(request: Request) {
  await ensureFinanceTables();

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");

  const admin = getSupabaseAdmin();
  let query = admin
    .from("finance_transactions")
    .select("*, finance_categories(id, name, type)")
    .not("category_id", "is", null)
    .is("deleted_at", null)
    .order("date", { ascending: false });

  if (month) {
    const [year, mon] = month.split("-");
    const from = `${year}-${mon}-01`;
    const lastDay = new Date(parseInt(year), parseInt(mon), 0).getDate();
    const to = `${year}-${mon}-${String(lastDay).padStart(2, "0")}`;
    query = query.gte("date", from).lte("date", to);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data || []).map((t) => {
    const cat = t.finance_categories as unknown as { name: string; type: string } | null;
    const amount = Math.abs(t.amount as number);
    const transactionType = (t.amount as number) < 0 ? "Expense" : "Income";
    const [year, mon, day] = (t.date as string).split("-");
    const formattedDate = `${year}-${mon}-${day}`;

    return [
      "Jan lipczynski",
      cat?.name || "Inne",
      t.tag as string || "",
      "PLN",
      amount.toFixed(2),
      "",
      "jlipczynski",
      formattedDate,
      "00:00",
      "",
      t.description as string,
      transactionType,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  });

  const header = "Ledger,Category,Subcategory,Currency,Price,Account,Recorder,Date,Time,Tag,Note,Transaction";
  const csv = [header, ...rows].join("\n");
  const filename = month ? `Budget_${month}.csv` : "Budget.csv";

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
