import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/finanse-db";

export const dynamic = "force-dynamic";

const LIMIT = 300;
const MAX_BATCH = 200;

// GET /api/finanse/review — transactions waiting for the weekly review (reviewed_at is null),
// newest first, plus the category/subcategory lists the review page needs.
export async function GET() {
  const admin = getSupabaseAdmin();
  const [tx, count, cats, subs] = await Promise.all([
    admin
      .from("finance_transactions")
      .select("id, date, amount, description, counterparty, merchant, import_hash, category_id, subcategory_id, place, one_off, tag, notes")
      .is("deleted_at", null)
      .is("reviewed_at", null)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(LIMIT),
    admin.from("finance_transactions").select("id", { count: "exact", head: true }).is("deleted_at", null).is("reviewed_at", null),
    admin.from("finance_categories").select("id, name, type, icon, color, sort_order").order("sort_order").order("name"),
    admin.from("finance_subcategories").select("id, name, category_id, kind, sort_order").order("sort_order").order("name"),
  ]);
  const err = tx.error || count.error || cats.error || subs.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });

  return NextResponse.json({
    transactions: tx.data ?? [],
    total: count.count ?? 0,
    categories: cats.data ?? [],
    subcategories: subs.data ?? [],
  });
}

type ReviewItem = {
  id: string;
  categoryId?: string | null;
  subcategoryId?: string | null;
  oneOff?: boolean;
};

// POST /api/finanse/review { items: ReviewItem[] }
// Saves the (optional) corrections and marks each transaction as reviewed (reviewed_at = now).
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const items: ReviewItem[] = Array.isArray(body?.items) ? body.items : [];
  if (items.length === 0) return NextResponse.json({ error: "No items" }, { status: 400 });
  if (items.length > MAX_BATCH) return NextResponse.json({ error: `Max ${MAX_BATCH} items` }, { status: 400 });

  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  const plainIds: string[] = [];
  const failed: string[] = [];

  for (const it of items) {
    if (!it?.id || typeof it.id !== "string") continue;
    const update: Record<string, string | boolean | null> = {};
    if (it.categoryId !== undefined) update.category_id = it.categoryId || null;
    if (it.subcategoryId !== undefined) update.subcategory_id = it.subcategoryId || null;
    if (it.oneOff !== undefined) update.one_off = !!it.oneOff;
    if (Object.keys(update).length === 0) {
      plainIds.push(it.id);
      continue;
    }
    update.reviewed_at = now;
    const { error } = await admin.from("finance_transactions").update(update).eq("id", it.id);
    if (error) failed.push(it.id);
  }

  if (plainIds.length > 0) {
    const { error } = await admin.from("finance_transactions").update({ reviewed_at: now }).in("id", plainIds);
    if (error) failed.push(...plainIds);
  }

  if (failed.length > 0) return NextResponse.json({ error: "Część zmian nie zapisała się", failed }, { status: 500 });
  return NextResponse.json({ ok: true, reviewed: items.length });
}
