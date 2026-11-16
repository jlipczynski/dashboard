// @vitest-environment node
// /api/wydatek against an IN-MEMORY database (an isolated environment — zero contact with production).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

type Row = Record<string, unknown> & { id: string; import_hash: string; created_at: string; category_id: string | null }
const db: { tx: Row[]; cats: { id: string; name: string; type: string }[] } = { tx: [], cats: [] }
let failNext: string | null = null

// Minimal query builder in the shape of supabase-js (only what the route uses).
function table(name: string) {
  const filters: ((r: Row) => boolean)[] = []
  let op: "select" | "upsert" | "delete" = "select"
  let payload: Row | null = null
  let limitN: number | null = null
  let order: { col: string; asc: boolean } | null = null
  let single = false
  const rows = () => (name === "finance_categories" ? (db.cats as unknown as Row[]) : db.tx)
  const withCat = (r: Row) => ({ ...r, finance_categories: db.cats.find((c) => c.id === r.category_id) ? { name: db.cats.find((c) => c.id === r.category_id)!.name } : null })
  const exec = () => {
    if (failNext) { const e = failNext; failNext = null; return { data: null, error: { message: e } } }
    if (op === "upsert") {
      // atomic like Postgres: the unique import_hash decides
      if (db.tx.some((r) => r.import_hash === payload!.import_hash)) return { data: [], error: null }
      const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...payload! } as Row
      db.tx.push(row)
      return { data: [withCat(row)], error: null }
    }
    let out = rows().filter((r) => filters.every((f) => f(r)))
    if (op === "delete") {
      db.tx = db.tx.filter((r) => !out.includes(r))
      return { data: out.map((r) => ({ id: r.id })), error: null }
    }
    if (order) out = [...out].sort((a, b) => (String(a[order!.col]) < String(b[order!.col]) ? -1 : 1) * (order!.asc ? 1 : -1))
    if (limitN !== null) out = out.slice(0, limitN)
    const mapped = name === "finance_transactions" ? out.map(withCat) : out
    return { data: single ? mapped[0] ?? null : mapped, error: null }
  }
  const b = {
    select: () => b,
    upsert: (p: Row) => { op = "upsert"; payload = p; return b },
    delete: () => { op = "delete"; return b },
    eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b },
    gte: (c: string, v: string) => { filters.push((r) => String(r[c]) >= v); return b },
    is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return b },
    like: (c: string, p: string) => { filters.push((r) => String(r[c]).startsWith(p.replace(/%$/, ""))); return b },
    order: (col: string, o: { ascending: boolean }) => { order = { col, asc: o.ascending }; return b },
    limit: (n: number) => { limitN = n; return b },
    maybeSingle: () => { single = true; return b },
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(exec()).then(res, rej),
  }
  return b
}

vi.mock("@/lib/finanse-db", () => ({ getSupabaseAdmin: () => ({ from: (t: string) => table(t) }) }))
vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }))

import { getToken } from "next-auth/jwt"
import { GET, POST, DELETE } from "@/app/api/wydatek/route"

const OWNER = { email: "owner@test" }
const CAT = "11111111-1111-4111-8111-111111111111"
const key = () => crypto.randomUUID()
const post = (body: unknown) => POST(new NextRequest("http://localhost/api/wydatek", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }))
const del = (k: string) => DELETE(new NextRequest(`http://localhost/api/wydatek?key=${k}`, { method: "DELETE" }))
const get = () => GET(new NextRequest("http://localhost/api/wydatek"))

let logCalls = 0
beforeEach(() => {
  db.tx = [{ id: "bank-1", import_hash: "abc123bankhash", created_at: new Date().toISOString(), category_id: null, amount: "-10.00", date: "2026-11-01", description: "KARTA" }]
  db.cats = [{ id: CAT, name: "Food & Drink", type: "expense" }]
  failNext = null
  process.env.ALLOWED_EMAILS = "owner@test"
  vi.mocked(getToken).mockResolvedValue(OWNER as never)
  logCalls = 0
  for (const m of ["log", "error", "warn", "info"] as const) vi.spyOn(console, m).mockImplementation(() => { logCalls++ })
})
afterEach(() => vi.restoreAllMocks())

describe("authorization (server-side, independent of the middleware)", () => {
  it("not logged in → 401 for GET/POST/DELETE, no write", async () => {
    vi.mocked(getToken).mockResolvedValue(null)
    expect((await get()).status).toBe(401)
    expect((await post({ amount: "10", idempotencyKey: key() })).status).toBe(401)
    expect((await del(key())).status).toBe(401)
    expect(db.tx).toHaveLength(1)
  })
  it("Google account outside ALLOWED_EMAILS → 401", async () => {
    vi.mocked(getToken).mockResolvedValue({ email: "intruder@test" } as never)
    expect((await post({ amount: "10", idempotencyKey: key() })).status).toBe(401)
    expect(db.tx).toHaveLength(1)
  })
  it("read-only role (future tester) → write 403, read 200", async () => {
    vi.mocked(getToken).mockResolvedValue({ email: "owner@test", role: "tester" } as never)
    expect((await post({ amount: "10", idempotencyKey: key() })).status).toBe(403)
    expect((await del(key())).status).toBe(403)
    expect((await get()).status).toBe(200)
    expect(db.tx).toHaveLength(1)
  })
})

describe("saving", () => {
  it("amount only → 201, row in the transactions table (negative, cash, no category)", async () => {
    const k = key()
    const r = await post({ amount: "85,50", idempotencyKey: k })
    expect(r.status).toBe(201)
    const d = await r.json()
    expect(d).toMatchObject({ ok: true, duplicate: false, transaction: { amountGrosze: 8550, categoryId: null, key: k } })
    const row = db.tx.find((x) => x.import_hash === `cash:${k}`)!
    expect(row).toMatchObject({ amount: "-85.50", description: "Gotówka", category_id: null })
    expect(r.headers.get("cache-control")).toBe("no-store")
  })
  it("existing category → saved with category_id", async () => {
    const r = await post({ amount: "12", idempotencyKey: key(), categoryId: CAT })
    expect((await r.json()).transaction.categoryName).toBe("Food & Drink")
  })
  it("non-existent category → 400, no write", async () => {
    const r = await post({ amount: "12", idempotencyKey: key(), categoryId: "22222222-2222-4222-8222-222222222222" })
    expect(r.status).toBe(400)
    expect(db.tx).toHaveLength(1)
  })
  it.each([["0"], ["-5"], ["85,505"], ["abc"], ["100000,01"]])("invalid amount %s → 400, no write", async (amount) => {
    const r = await post({ amount, idempotencyKey: key() })
    expect(r.status).toBe(400)
    expect((await r.json()).error).toBeTruthy()
    expect(db.tx).toHaveLength(1)
  })
  it("invalid JSON → 400", async () => {
    const r = await POST(new NextRequest("http://localhost/api/wydatek", { method: "POST", body: "{nope" }))
    expect(r.status).toBe(400)
  })
  it("DB error → 500 'Nie zapisano', never ok:true", async () => {
    failNext = "boom"
    const r = await post({ amount: "10", idempotencyKey: key() })
    expect(r.status).toBe(500)
    const d = await r.json()
    expect(d.ok).toBeUndefined()
    expect(d.error).toMatch(/Nie zapisano/)
  })
})

describe("no duplicates", () => {
  it("double tap (2 parallel POSTs, same key) → 1 row", async () => {
    const k = key()
    const [a, b] = await Promise.all([post({ amount: "20", idempotencyKey: k }), post({ amount: "20", idempotencyKey: k })])
    const da = await a.json(), dbb = await b.json()
    expect([da.duplicate, dbb.duplicate].sort()).toEqual([false, true])
    expect(da.transaction.id).toBe(dbb.transaction.id)
    expect(db.tx.filter((x) => x.import_hash === `cash:${k}`)).toHaveLength(1)
  })
  it("retry after a timeout (the first one got through) → the same row, duplicate:true", async () => {
    const k = key()
    const first = await (await post({ amount: "45", idempotencyKey: k })).json()
    const retry = await post({ amount: "45", idempotencyKey: k })
    expect(retry.status).toBe(200)
    const d = await retry.json()
    expect(d).toMatchObject({ ok: true, duplicate: true })
    expect(d.transaction.id).toBe(first.transaction.id)
    expect(db.tx).toHaveLength(2)
  })
  it("10 parallel attempts with one key → still 1 row", async () => {
    const k = key()
    await Promise.all(Array.from({ length: 10 }, () => post({ amount: "5", idempotencyKey: k })))
    expect(db.tx.filter((x) => x.import_hash === `cash:${k}`)).toHaveLength(1)
  })
})

describe("Cofnij (undo) and the list", () => {
  it("undo of a fresh entry → deleted", async () => {
    const k = key()
    await post({ amount: "9,99", idempotencyKey: k })
    const r = await del(k)
    expect(r.status).toBe(200)
    expect(db.tx.some((x) => x.import_hash === `cash:${k}`)).toBe(false)
  })
  it("undo after 15 minutes → 404, the entry stays", async () => {
    const k = key()
    await post({ amount: "9,99", idempotencyKey: k })
    db.tx.find((x) => x.import_hash === `cash:${k}`)!.created_at = new Date(Date.now() - 16 * 60_000).toISOString()
    expect((await del(k)).status).toBe(404)
    expect(db.tx.some((x) => x.import_hash === `cash:${k}`)).toBe(true)
  })
  it("cannot delete a bank transaction (only cash: entries)", async () => {
    expect((await DELETE(new NextRequest("http://localhost/api/wydatek?key=abc123bankhash", { method: "DELETE" }))).status).toBe(400)
    expect(db.tx.some((x) => x.id === "bank-1")).toBe(true)
  })
  it("GET: only cash entries, newest first, at most 5", async () => {
    for (let i = 1; i <= 7; i++) {
      await post({ amount: String(i), idempotencyKey: key() })
      db.tx[db.tx.length - 1].created_at = new Date(Date.now() + i * 1000).toISOString()
    }
    const d = await (await get()).json()
    expect(d.recent).toHaveLength(5)
    expect(d.recent.map((r: { amountGrosze: number }) => r.amountGrosze)).toEqual([700, 600, 500, 400, 300])
    expect(d.recent.every((r: { key: string | null }) => r.key)).toBe(true)
  })

  it("GET: entries moved to the trash (deleted_at) are not listed", async () => {
    await post({ amount: "1", idempotencyKey: key() })
    await post({ amount: "2", idempotencyKey: key() })
    db.tx[db.tx.length - 1].deleted_at = new Date().toISOString()
    const d = await (await get()).json()
    expect(d.recent.map((r: { amountGrosze: number }) => r.amountGrosze)).toEqual([100])
  })
})

describe("logs", () => {
  it("the route logs nothing (no financial data in Vercel logs)", async () => {
    const k = key()
    await post({ amount: "85,50", idempotencyKey: k, description: "obiad" })
    await post({ amount: "85,50", idempotencyKey: k })
    await get()
    await del(k)
    failNext = "boom"
    await post({ amount: "1", idempotencyKey: key() })
    expect(logCalls).toBe(0)
  })
})
