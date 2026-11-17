import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/finanse-db";
import { CATEGORY_ICON_NAMES } from "@/components/finanse/CategoryIcon";
import {
  validateCategoryPatch,
  validateSubcategoryPatch,
  deleteGuard,
  mergePlan,
  reorder,
  CATEGORY_TYPES,
  KINDS,
  type CategoryType,
  type Kind,
  type UsageCounts,
} from "@/lib/finanse-taxonomy";

export const dynamic = "force-dynamic";

// /finanse/kategorie — taxonomy maintenance.
// GET    tree with counters (transactions without trash, trash, rules, current-month sum)
// PATCH  { entity, id, ...fields } | { entity: "category", id, move: "up" | "down" }
// POST   { action: "create", entity, ... } | { action: "merge", entity, fromId, toId, dryRun? }
// DELETE ?entity=&id=  — only when nothing refers to the item
// Merge / move run as SQL functions (migration 026): all-or-nothing.

type Entity = "category" | "subcategory";
const PAGE = 1000;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

const RPC_ERRORS: Record<string, string> = {
  merge_self: "Nie można scalić pozycji z samą sobą",
  merge_target_missing: "Nie ma pozycji docelowej",
  merge_source_missing: "Nie ma pozycji do scalenia",
  move_source_missing: "Nie ma takiej podkategorii",
  move_target_missing: "Nie ma kategorii docelowej",
  move_name_conflict: "W kategorii docelowej jest już podkategoria o tej nazwie — scal je zamiast przenosić",
};
const rpcMessage = (msg: string) => RPC_ERRORS[Object.keys(RPC_ERRORS).find((k) => msg.includes(k)) ?? ""] ?? msg;
const uniqueMessage = (msg: string) =>
  /duplicate key|unique/i.test(msg) ? "Taka nazwa już istnieje" : msg;

/** Current month (YYYY-MM) in Warsaw time. */
function warsawMonth(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
}

async function usage(entity: Entity, id: string): Promise<UsageCounts> {
  const admin = getSupabaseAdmin();
  const col = entity === "category" ? "category_id" : "subcategory_id";
  const head = { count: "exact" as const, head: true };
  const [tx, trash, rules, subs] = await Promise.all([
    admin.from("finance_transactions").select("id", head).eq(col, id).is("deleted_at", null),
    admin.from("finance_transactions").select("id", head).eq(col, id).not("deleted_at", "is", null),
    admin.from("finance_rules").select("id", head).eq(col, id),
    entity === "category"
      ? admin.from("finance_subcategories").select("id", head).eq("category_id", id)
      : Promise.resolve({ count: 0, error: null }),
  ]);
  const err = tx.error || trash.error || rules.error || subs.error;
  if (err) throw new Error(err.message);
  return { transactions: tx.count ?? 0, trashed: trash.count ?? 0, rules: rules.count ?? 0, subcategories: subs.count ?? 0 };
}

export async function GET() {
  const admin = getSupabaseAdmin();
  const [cats, subs, rules] = await Promise.all([
    admin.from("finance_categories").select("id, name, type, icon, color, sort_order"),
    admin.from("finance_subcategories").select("id, name, category_id, kind, sort_order"),
    admin.from("finance_rules").select("category_id, subcategory_id"),
  ]);
  const err = cats.error || subs.error || rules.error;
  if (err) return json({ error: err.message }, 500);

  const txs: { category_id: string | null; subcategory_id: string | null; amount: number | string; date: string; deleted_at: string | null }[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from("finance_transactions")
      .select("category_id, subcategory_id, amount, date, deleted_at")
      .order("id")
      .range(offset, offset + PAGE - 1);
    if (error) return json({ error: error.message }, 500);
    txs.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  const month = warsawMonth();
  const counter = () => ({ txCount: 0, trashCount: 0, ruleCount: 0, monthGr: 0 });
  const byCat = new Map<string, ReturnType<typeof counter>>();
  const bySub = new Map<string, ReturnType<typeof counter>>();
  const get = (m: Map<string, ReturnType<typeof counter>>, k: string) => {
    let v = m.get(k);
    if (!v) m.set(k, (v = counter()));
    return v;
  };
  for (const t of txs) {
    const targets = [t.category_id && get(byCat, t.category_id), t.subcategory_id && get(bySub, t.subcategory_id)].filter(Boolean) as ReturnType<typeof counter>[];
    for (const c of targets) {
      if (t.deleted_at) c.trashCount++;
      else {
        c.txCount++;
        if (t.date.slice(0, 7) === month) c.monthGr += Math.round(Number(t.amount) * 100);
      }
    }
  }
  for (const r of rules.data ?? []) {
    if (r.category_id) get(byCat, r.category_id).ruleCount++;
    if (r.subcategory_id) get(bySub, r.subcategory_id).ruleCount++;
  }

  const sortFn = (a: { sort_order: number; name: string }, b: { sort_order: number; name: string }) =>
    a.sort_order - b.sort_order || a.name.localeCompare(b.name, "pl");

  const categories = [...(cats.data ?? [])].sort(sortFn).map((c) => {
    const k = byCat.get(c.id) ?? counter();
    // Month sum shown as a positive "how much": expenses/transfers net outflow, income net inflow.
    const monthAmount = (c.type === "income" ? k.monthGr : -k.monthGr) / 100;
    return {
      ...c,
      txCount: k.txCount,
      trashCount: k.trashCount,
      ruleCount: k.ruleCount,
      monthAmount,
      subcategories: (subs.data ?? [])
        .filter((s) => s.category_id === c.id)
        .sort(sortFn)
        .map((s) => {
          const ks = bySub.get(s.id) ?? counter();
          return { ...s, txCount: ks.txCount, trashCount: ks.trashCount, ruleCount: ks.ruleCount };
        }),
    };
  });

  return json({ month, categories, icons: CATEGORY_ICON_NAMES });
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const entity = body?.entity as Entity | undefined;
  const id = typeof body?.id === "string" ? body.id : null;
  if (!body || !id || (entity !== "category" && entity !== "subcategory")) return json({ error: "Brak entity lub id" }, 400);
  const admin = getSupabaseAdmin();

  if (entity === "category" && (body.move === "up" || body.move === "down")) {
    const { data: me } = await admin.from("finance_categories").select("type").eq("id", id).maybeSingle();
    if (!me) return json({ error: "Nie ma takiej kategorii" }, 404);
    const { data: same, error } = await admin.from("finance_categories").select("id, name, sort_order").eq("type", me.type);
    if (error) return json({ error: error.message }, 500);
    for (const u of reorder(same ?? [], id, body.move)) {
      const { error: e } = await admin.from("finance_categories").update({ sort_order: u.sort_order }).eq("id", u.id);
      if (e) return json({ error: e.message }, 500);
    }
    return json({ ok: true });
  }

  if (entity === "category") {
    const v = validateCategoryPatch(body, CATEGORY_ICON_NAMES);
    if (!v.ok) return json({ error: v.error }, 400);
    const { error } = await admin.from("finance_categories").update(v.value).eq("id", id);
    if (error) return json({ error: uniqueMessage(error.message) }, 400);
    return json({ ok: true });
  }

  const v = validateSubcategoryPatch(body);
  if (!v.ok) return json({ error: v.error }, 400);
  const { category_id, ...rest } = v.value;
  if (category_id) {
    const { data: cur } = await admin.from("finance_subcategories").select("category_id").eq("id", id).maybeSingle();
    if (!cur) return json({ error: "Nie ma takiej podkategorii" }, 404);
    if (cur.category_id !== category_id) {
      const { error } = await admin.rpc("finance_move_subcategory", { p_sub: id, p_to_category: category_id });
      if (error) return json({ error: rpcMessage(error.message) }, 400);
    }
  }
  if (Object.keys(rest).length > 0) {
    const { error } = await admin.from("finance_subcategories").update(rest).eq("id", id);
    if (error) return json({ error: uniqueMessage(error.message) }, 400);
  }
  return json({ ok: true });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const entity = body?.entity as Entity | undefined;
  if (!body || (entity !== "category" && entity !== "subcategory")) return json({ error: "Brak entity" }, 400);
  const admin = getSupabaseAdmin();

  if (body.action === "create") {
    if (entity === "category") {
      const type = body.type as CategoryType;
      if (!CATEGORY_TYPES.includes(type)) return json({ error: "Nieznany typ kategorii" }, 400);
      const v = validateCategoryPatch(
        { name: body.name, type, icon: body.icon ?? "dots", color: body.color ?? "#8A847E" },
        CATEGORY_ICON_NAMES
      );
      if (!v.ok) return json({ error: v.error }, 400);
      const { data: last } = await admin
        .from("finance_categories")
        .select("sort_order")
        .eq("type", type)
        .order("sort_order", { ascending: false })
        .limit(1);
      const sort_order = (last?.[0]?.sort_order ?? 0) + 10;
      const { data, error } = await admin.from("finance_categories").insert({ ...v.value, sort_order }).select().single();
      if (error) return json({ error: uniqueMessage(error.message) }, 400);
      return json({ category: data });
    }
    const categoryId = typeof body.categoryId === "string" ? body.categoryId : null;
    if (!categoryId) return json({ error: "Brak kategorii" }, 400);
    const kind = (body.kind ?? null) as Kind | null;
    if (kind !== null && !KINDS.includes(kind)) return json({ error: "Nieznany rodzaj" }, 400);
    const v = validateSubcategoryPatch({ name: body.name });
    if (!v.ok) return json({ error: v.error }, 400);
    const { data, error } = await admin
      .from("finance_subcategories")
      .insert({ name: v.value.name, category_id: categoryId, kind })
      .select()
      .single();
    if (error) return json({ error: uniqueMessage(error.message) }, 400);
    return json({ subcategory: data });
  }

  if (body.action === "merge") {
    const fromId = typeof body.fromId === "string" ? body.fromId : "";
    const toId = typeof body.toId === "string" ? body.toId : "";
    const table = entity === "category" ? "finance_categories" : "finance_subcategories";
    const { data: items, error } = await admin.from(table).select("id, name").in("id", [fromId, toId]);
    if (error) return json({ error: error.message }, 500);
    const counts = await usage(entity, fromId).catch((e: Error) => e);
    if (counts instanceof Error) return json({ error: counts.message }, 500);
    const plan = mergePlan(entity, items?.find((i) => i.id === fromId), items?.find((i) => i.id === toId), counts);
    if (!plan.ok) return json({ error: plan.error }, 400);
    if (body.dryRun) return json({ plan: plan.value });

    const fn = entity === "category" ? "finance_merge_category" : "finance_merge_subcategory";
    const { data: moved, error: rpcError } = await admin.rpc(fn, { p_from: fromId, p_to: toId });
    if (rpcError) return json({ error: rpcMessage(rpcError.message) }, 400);
    return json({ ok: true, moved });
  }

  return json({ error: "Nieznana akcja" }, 400);
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const entity = searchParams.get("entity") as Entity | null;
  const id = searchParams.get("id");
  if (!id || (entity !== "category" && entity !== "subcategory")) return json({ error: "Brak entity lub id" }, 400);

  const counts = await usage(entity, id).catch((e: Error) => e);
  if (counts instanceof Error) return json({ error: counts.message }, 500);
  const guard = deleteGuard(counts);
  if (!guard.ok) return json({ error: guard.reason }, 409);

  const table = entity === "category" ? "finance_categories" : "finance_subcategories";
  const { error } = await getSupabaseAdmin().from(table).delete().eq("id", id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}
