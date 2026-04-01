import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { ensureFinanceTables } from "@/lib/finanse-db";

// GET /api/finanse/transactions?month=2026-03&categoryId=...
export async function GET(request: Request) {
  if (!supabase) return NextResponse.json({ transactions: [] });

  await ensureFinanceTables();

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month"); // YYYY-MM
  const categoryId = searchParams.get("categoryId");

  let query = supabase
    .from("finance_transactions")
    .select("*, finance_categories(id, name, type)")
    .order("date", { ascending: false });

  if (month) {
    const [year, mon] = month.split("-");
    const from = `${year}-${mon}-01`;
    const lastDay = new Date(parseInt(year), parseInt(mon), 0).getDate();
    const to = `${year}-${mon}-${String(lastDay).padStart(2, "0")}`;
    query = query.gte("date", from).lte("date", to);
  }

  if (categoryId) {
    query = query.eq("category_id", categoryId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ transactions: data });
}

// POST /api/finanse/transactions  { transactions: [...], rules: [...] }
// Saves a batch of transactions and optional rules
export async function POST(request: Request) {
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  await ensureFinanceTables();

  const { transactions, rules } = await request.json();

  if (!Array.isArray(transactions) || transactions.length === 0) {
    return NextResponse.json({ error: "No transactions" }, { status: 400 });
  }

  // Save rules first
  if (Array.isArray(rules) && rules.length > 0) {
    const rulesPayload = rules.map((r: { pattern: string; categoryId: string }) => ({
      pattern: r.pattern.toUpperCase(),
      category_id: r.categoryId,
    }));
    await supabase.from("finance_rules").upsert(rulesPayload, { onConflict: "pattern" });
  }

  // Save transactions (skip duplicates via import_hash unique constraint)
  const payload = transactions.map((t: {
    date: string;
    description: string;
    counterparty: string | null;
    amount: number;
    balance: number | null;
    importHash: string;
    categoryId: string | null;
  }) => ({
    date: t.date,
    description: t.description,
    counterparty: t.counterparty,
    amount: t.amount,
    balance: t.balance,
    category_id: t.categoryId || null,
    import_hash: t.importHash,
  }));

  const { error } = await supabase
    .from("finance_transactions")
    .upsert(payload, { onConflict: "import_hash", ignoreDuplicates: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, saved: payload.length });
}

// PATCH /api/finanse/transactions?id=...  { categoryId }
export async function PATCH(request: Request) {
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { categoryId } = await request.json();

  const { error } = await supabase
    .from("finance_transactions")
    .update({ category_id: categoryId || null })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// DELETE /api/finanse/transactions?id=...
export async function DELETE(request: Request) {
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabase.from("finance_transactions").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
