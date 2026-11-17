import { NextResponse } from "next/server";
import { getSupabaseAdmin, ensureFinanceTables } from "@/lib/finanse-db";
import { normalizeRule, validateRule } from "@/lib/finanse-rules";
import { planEmailMatches, toGrosze, cardLast4, DUPLICATE_NOTE, MATCH_WINDOW_DAYS } from "@/lib/finanse-email-match";

type Admin = ReturnType<typeof getSupabaseAdmin>;
const shiftDate = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Applies planEmailMatches to the new CSV rows; returns the rows that still have to be inserted. */
async function mergeWithEmailRows(
  admin: Admin,
  payload: Record<string, unknown>[]
): Promise<{ insert: Record<string, unknown>[]; updated: number; flagged: number } | { error: string }> {
  // Only rows that are really new (a known import_hash is skipped by the upsert anyway).
  const hashes = payload.map((r) => r.import_hash as string);
  const { data: existing, error: exErr } = await admin.from("finance_transactions").select("import_hash").in("import_hash", hashes);
  if (exErr) return { error: exErr.message };
  const known = new Set((existing ?? []).map((e) => e.import_hash as string));
  const fresh = payload.filter((r) => !known.has(r.import_hash as string));
  if (fresh.length === 0) return { insert: payload, updated: 0, flagged: 0 };

  const dates = fresh.map((r) => r.date as string).sort();
  const { data: emailRows, error } = await admin
    .from("finance_transactions")
    .select("id, date, amount, balance, counterparty, description, notes")
    .eq("source", "email")
    .gte("date", shiftDate(dates[0], -MATCH_WINDOW_DAYS))
    .lte("date", shiftDate(dates[dates.length - 1], MATCH_WINDOW_DAYS));
  if (error) return { error: error.message };
  if (!emailRows || emailRows.length === 0) return { insert: payload, updated: 0, flagged: 0 };

  // Identifying evidence: balance after the operation, payee + title, card (see finanse-email-match).
  const plan = planEmailMatches(
    fresh.map((r) => ({
      date: r.date as string,
      amountGrosze: toGrosze(r.amount as number),
      balanceGrosze: r.balance == null ? null : toGrosze(r.balance as number),
      counterparty: (r.counterparty as string | null) ?? null,
      title: (r.description as string | null) ?? null,
      cardLast4: cardLast4(r.description as string | null),
    })),
    emailRows.map((e) => ({
      id: e.id as string,
      date: e.date as string,
      amountGrosze: toGrosze(e.amount as string),
      balanceGrosze: e.balance == null ? null : toGrosze(e.balance as string),
      counterparty: (e.counterparty as string | null) ?? null,
      title: (e.description as string | null) ?? null,
      cardLast4: cardLast4(e.description as string | null),
    }))
  );
  const notesById = new Map(emailRows.map((e) => [e.id as string, (e.notes as string | null) ?? null]));
  const withNote = (n: string | null) => (n && n.includes(DUPLICATE_NOTE) ? n : n ? `${n} · ${DUPLICATE_NOTE}` : DUPLICATE_NOTE);

  const insert = payload.filter((r) => known.has(r.import_hash as string));
  let updated = 0;
  let flagged = 0;
  for (let i = 0; i < fresh.length; i++) {
    const row = fresh[i];
    const d = plan[i];
    if (d.action === "update") {
      // Keep category, subcategory, one_off, reviewed_at, notes, email_message_id.
      const { error: upErr } = await admin
        .from("finance_transactions")
        .update({
          import_hash: row.import_hash,
          description: row.description,
          counterparty: row.counterparty,
          merchant: row.merchant ?? null,
          balance: row.balance ?? null,
          source: "csv",
        })
        .eq("id", d.emailId);
      if (upErr) return { error: upErr.message };
      updated++;
    } else if (d.action === "review") {
      // Ambiguous: nothing is merged. The CSV row is saved (the bank statement is the source of truth)
      // and both sides are flagged for manual review.
      insert.push({ ...row, reviewed_at: null, notes: withNote((row.notes as string | null) ?? null) });
      for (const id of d.emailIds) {
        const { error: flagErr } = await admin
          .from("finance_transactions")
          .update({ reviewed_at: null, notes: withNote(notesById.get(id) ?? null) })
          .eq("id", id);
        if (flagErr) return { error: flagErr.message };
      }
      flagged++;
    } else {
      insert.push(row);
    }
  }
  return { insert, updated, flagged };
}

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
      source: "csv",
    };
    if (t.tag) row.tag = t.tag;
    if (t.merchant) row.merchant = t.merchant;
    if (t.notes) row.notes = t.notes;
    return row;
  });

  // CSV ↔ e-mail (Finanse 08): a payment that already came in from an Erste alert is UPDATED with the CSV
  // data instead of inserted again (category, notes, review state stay).
  const matched = await mergeWithEmailRows(admin, payload);
  if ("error" in matched) return NextResponse.json({ error: matched.error }, { status: 500 });

  if (matched.insert.length > 0) {
    const { error } = await admin
      .from("finance_transactions")
      .upsert(matched.insert, { onConflict: "import_hash", ignoreDuplicates: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    saved: payload.length,
    rulesRejected,
    emailMatched: matched.updated,
    emailPossibleDuplicates: matched.flagged,
  });
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
