import { NextResponse } from "next/server";
import { getSupabaseAdmin, ensureFinanceTables } from "@/lib/finanse-db";
import { normalizeRule, validateRule } from "@/lib/finanse-rules";

// GET /api/finanse/transactions?month=2026-03&categoryId=...
// GET /api/finanse/transactions?trash=true — only rows in the trash (deleted_at set), newest deletion first, no month filter.
export async function GET(request: Request) {
  await ensureFinanceTables();

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month"); // YYYY-MM
  const categoryId = searchParams.get("categoryId");
  const uncategorized = searchParams.get("uncategorized") === "true";
  const trash = searchParams.get("trash") === "true";

  const admin = getSupabaseAdmin();
  const select = "*, finance_categories(id, name, type), finance_subcategories(id, name)";

  if (trash) {
    const { data, error } = await admin
      .from("finance_transactions")
      .select(select)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ transactions: data });
  }

  let query = admin
    .from("finance_transactions")
    .select(select)
    .is("deleted_at", null)
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

  // Rules from the import preview ("Zapamiętaj"). Too general ones are skipped (the transactions are still saved);
  // one row per (pattern, recipient) — Postgres rejects an upsert touching the same row twice.
  let rulesRejected = 0;
  if (Array.isArray(rules) && rules.length > 0) {
    const byKey = new Map<string, { pattern: string; counterparty_pattern: string | null; category_id: string }>();
    for (const r of rules as { pattern: string; counterpartyPattern?: string | null; categoryId: string }[]) {
      if (!r?.pattern || !r.categoryId) continue;
      const rule = normalizeRule(String(r.pattern), r.counterpartyPattern ? String(r.counterpartyPattern) : null);
      if (validateRule(rule.pattern, rule.counterparty_pattern)) {
        rulesRejected++;
        continue;
      }
      byKey.set(`${rule.pattern}|${rule.counterparty_pattern ?? ""}`, { ...rule, category_id: r.categoryId });
    }
    if (byKey.size > 0) {
      await admin.from("finance_rules").upsert([...byKey.values()], { onConflict: "pattern,counterparty_pattern" });
    }
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

  return NextResponse.json({ ok: true, saved: payload.length, rulesRejected });
}

// PATCH /api/finanse/transactions?id=...  { categoryId }
// PATCH /api/finanse/transactions?id=...&restore=true — take the row out of the trash.
export async function PATCH(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  if (searchParams.get("restore") === "true") {
    const { error } = await getSupabaseAdmin()
      .from("finance_transactions")
      .update({ deleted_at: null })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

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

// DELETE /api/finanse/transactions?id=... — moves the row to the trash (soft delete).
// The row stays in the DB so its import_hash keeps blocking a re-import of the same transaction.
// No hard delete from the UI on purpose: it would bring the duplicates problem back.
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("finance_transactions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null); // already in the trash → keep the original deletion date
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
