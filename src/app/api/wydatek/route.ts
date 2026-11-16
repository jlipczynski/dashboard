import { NextResponse, type NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"
import { getSupabaseAdmin } from "@/lib/finanse-db"
import { isEmailAllowed } from "@/lib/google-auth"
import {
  buildCashRow,
  numericToGrosze,
  isValidIdempotencyKey,
  CASH_HASH_PREFIX,
  UNDO_WINDOW_MS,
} from "@/lib/wydatek"

export const dynamic = "force-dynamic"

// Quick cash expenses (/wydatek). Writes to the existing finance_transactions table:
// negative amount, import_hash = "cash:<idempotency key>" (unique — no duplicates on a double tap / retry).
// No logging of financial data.

const NO_STORE = { "Cache-Control": "no-store" }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

type Auth = { ok: true; canWrite: boolean } | { ok: false; res: NextResponse }

// Second layer behind the middleware: our own session check in the route.
async function authorize(req: NextRequest): Promise<Auth> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token || !isEmailAllowed(token.email as string | undefined)) {
    return { ok: false, res: json({ error: "Zaloguj się." }, 401) }
  }
  // Ready for a future read-only account: any role other than the owner cannot write.
  const role = (token as { role?: string }).role
  return { ok: true, canWrite: role === undefined || role === "owner" }
}

type Row = {
  id: string
  date: string
  amount: string | number
  description: string
  category_id: string | null
  import_hash: string
  created_at: string
  finance_categories?: { name: string } | null
}

function toDto(r: Row) {
  return {
    id: r.id,
    date: r.date,
    amountGrosze: numericToGrosze(r.amount),
    description: r.description,
    categoryId: r.category_id,
    categoryName: r.finance_categories?.name ?? null,
    key: r.import_hash.startsWith(CASH_HASH_PREFIX) ? r.import_hash.slice(CASH_HASH_PREFIX.length) : null,
    createdAt: r.created_at,
  }
}

const SELECT = "id, date, amount, description, category_id, import_hash, created_at, finance_categories(name)"

// GET /api/wydatek — the 5 latest cash entries
export async function GET(req: NextRequest) {
  const auth = await authorize(req)
  if (!auth.ok) return auth.res

  const { data, error } = await getSupabaseAdmin()
    .from("finance_transactions")
    .select(SELECT)
    .like("import_hash", `${CASH_HASH_PREFIX}%`)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(5)
  if (error) return json({ error: "Nie udało się pobrać ostatnich wydatków." }, 500)
  return json({ recent: ((data ?? []) as unknown as Row[]).map(toDto) })
}

// POST /api/wydatek  { amount: "85,50", idempotencyKey: uuid, categoryId?, description?, date? }
export async function POST(req: NextRequest) {
  const auth = await authorize(req)
  if (!auth.ok) return auth.res
  if (!auth.canWrite) return json({ error: "Tryb tylko do odczytu." }, 403)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json({ error: "Nieprawidłowe dane." }, 400)
  }
  const built = buildCashRow((body ?? {}) as Record<string, unknown>)
  if (!built.ok) return json({ error: built.error }, built.status)

  const admin = getSupabaseAdmin()

  if (built.row.category_id) {
    const { data: cat, error: catErr } = await admin
      .from("finance_categories")
      .select("id")
      .eq("id", built.row.category_id)
      .maybeSingle()
    if (catErr) return json({ error: "Nie zapisano — błąd serwera. Spróbuj ponownie." }, 500)
    if (!cat) return json({ error: "Nieprawidłowa kategoria." }, 400)
  }

  // Idempotent: the same key → the same row (a second tap / retry after a timeout inserts nothing).
  const { data: inserted, error } = await admin
    .from("finance_transactions")
    .upsert(built.row, { onConflict: "import_hash", ignoreDuplicates: true })
    .select(SELECT)
  if (error) return json({ error: "Nie zapisano — błąd serwera. Spróbuj ponownie." }, 500)

  if (inserted && inserted.length > 0) {
    return json({ ok: true, duplicate: false, transaction: toDto(inserted[0] as unknown as Row) }, 201)
  }

  const { data: existing, error: exErr } = await admin
    .from("finance_transactions")
    .select(SELECT)
    .eq("import_hash", built.row.import_hash)
    .is("deleted_at", null)
    .maybeSingle()
  if (exErr || !existing) return json({ error: "Nie zapisano — błąd serwera. Spróbuj ponownie." }, 500)
  return json({ ok: true, duplicate: true, transaction: toDto(existing as unknown as Row) })
}

// DELETE /api/wydatek?key=<uuid> — "Cofnij": only a cash entry, only within 15 minutes of saving.
export async function DELETE(req: NextRequest) {
  const auth = await authorize(req)
  if (!auth.ok) return auth.res
  if (!auth.canWrite) return json({ error: "Tryb tylko do odczytu." }, 403)

  const key = req.nextUrl.searchParams.get("key")
  if (!isValidIdempotencyKey(key)) return json({ error: "Nieprawidłowy klucz." }, 400)

  const since = new Date(Date.now() - UNDO_WINDOW_MS).toISOString()
  const { data, error } = await getSupabaseAdmin()
    .from("finance_transactions")
    .delete()
    .eq("import_hash", `${CASH_HASH_PREFIX}${key.toLowerCase()}`)
    .gte("created_at", since)
    .select("id")
  if (error) return json({ error: "Nie udało się cofnąć — spróbuj ponownie." }, 500)
  if (!data || data.length === 0) {
    return json({ error: "Nie można cofnąć (wpis nie istnieje albo minęło 15 minut). Usuń go w Finansach." }, 404)
  }
  return json({ ok: true, deleted: data.length })
}
