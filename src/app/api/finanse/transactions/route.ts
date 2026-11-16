import { NextResponse } from "next/server";
import { getSupabaseAdmin, ensureFinanceTables } from "@/lib/finanse-db";

// GET /api/finanse/transactions?month=2026-03&categoryId=...
export async function GET(request: Request) {
  await ensureFinanceTables();

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month"); // YYYY-MM
  const categoryId = searchParams.get("categoryId");
  const uncategorized = searchParams.get("uncategorized") === "true";

  const admin = getSupabaseAdmin();
  let query = admin
    .from("finance_transactions")
    .select("*, finance_categories(id, name, type), finance_subcategories(id, name)")
    .order("date", { ascending: false });

  if (uncategorized) {
    query = query.is("category_id", null);
  } else if (month) {
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
export async function POST(request: Request) {
  await ensureFinanceTables();

  const { transactions, rules } = await request.json();

  if (!Array.isArray(transactions) || transactions.length === 0) {
    return NextResponse.json({ error: "No transactions" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  if (Array.isArray(rules) && rules.length > 0) {
    const rulesPayload = rules.map((r: { pattern: string; categoryId: string }) => ({
      pattern: r.pattern.toUpperCase(),
      category_id: r.categoryId,
    }));
    await admin.from("finance_rules").upsert(rulesPayload, { onConflict: "pattern" });
  }

  const payload = transactions.map((t: {
    date: string;
    description: string;
    counterparty: string | null;
    merchant?: string | null;
    amount: number;
    balance: number | null;
    importHash: string;
    categoryId: string | null;
    subcategoryId?: string | null;
    tag?: string | null;
    notes?: string | null;
  }) => {
    const row: Record<string, unknown> = {
      date: t.date,
      description: t.description,
      counterparty: t.counterparty,
      amount: t.amount,
      balance: t.balance,
      category_id: t.categoryId || null,
      subcategory_id: t.subcategoryId || null,
      import_hash: t.importHash,
    };
    if (t.tag) row.tag = t.tag;
    if (t.merchant) row.merchant = t.merchant;
    if (t.notes) row.notes = t.notes;
    return row;
  });

  const { error } = await admin
    .from("finance_transactions")
    .upsert(payload, { onConflict: "import_hash", ignoreDuplicates: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, saved: payload.length });
}

// PATCH /api/finanse/transactions?id=...  { categoryId }
export async function PATCH(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { categoryId, subcategoryId, tag, notes } = await request.json();

  const update: Record<string, string | null> = {};
  if (categoryId !== undefined) update.category_id = categoryId || null;
  if (subcategoryId !== undefined) update.subcategory_id = subcategoryId || null;
  if (tag !== undefined) update.tag = tag || null;
  if (notes !== undefined) update.notes = notes || null;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("finance_transactions")
    .update(update)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// DELETE /api/finanse/transactions?id=...
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { error } = await admin.from("finance_transactions").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
