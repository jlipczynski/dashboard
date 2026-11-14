// "Szybki Wydatek" — pure logic (no DB): amount parsing, validation, the finance_transactions row.
// Convention of the existing module: an expense = negative `amount` (numeric 12,2).
// Cash entries are recognised by the `import_hash` prefix "cash:" (no schema migration).

export const CASH_HASH_PREFIX = "cash:"
export const CASH_DESCRIPTION = "Gotówka"
export const MAX_AMOUNT_GROSZE = 100_000_00 // 100 000 zł — sanity limit for a single cash entry
export const UNDO_WINDOW_MS = 15 * 60 * 1000 // "Cofnij" works for 15 minutes after saving
export const MAX_DESCRIPTION_LENGTH = 200

export type ParseResult = { ok: true; grosze: number } | { ok: false; error: string }

// Accepts "85", "85,5", "85,50", "85.50", "1 234,56", "1234.5 zł". Integers only (grosze) — no floats.
export function parseAmountPL(input: unknown): ParseResult {
  if (typeof input !== "string" && typeof input !== "number") return { ok: false, error: "Podaj kwotę." }
  let s = String(input).trim().toLowerCase()
  s = s.replace(/zł|pln/g, "").replace(/[\s  ]/g, "")
  if (s === "") return { ok: false, error: "Podaj kwotę." }
  if (s.startsWith("-")) return { ok: false, error: "Kwota musi być większa od zera." }
  if (s.startsWith("+")) s = s.slice(1)

  // One decimal separator (comma or dot), at most 2 decimal places.
  const m = s.match(/^(\d{1,9})(?:[.,](\d{1,2}))?$/)
  if (!m) {
    if (/^\d+[.,]\d{3,}$/.test(s)) return { ok: false, error: "Maksymalnie 2 miejsca po przecinku." }
    return { ok: false, error: "Nieprawidłowa kwota. Przykład: 85,50" }
  }
  const zl = parseInt(m[1], 10)
  const gr = m[2] ? parseInt(m[2].padEnd(2, "0"), 10) : 0
  const grosze = zl * 100 + gr
  if (grosze <= 0) return { ok: false, error: "Kwota musi być większa od zera." }
  if (grosze > MAX_AMOUNT_GROSZE) return { ok: false, error: "Kwota za duża (limit 100 000 zł)." }
  return { ok: true, grosze }
}

// Expense amount for the `numeric` column, as a string (no floats): 8550 → "-85.50".
export function groszeToNegativeNumeric(grosze: number): string {
  const zl = Math.floor(grosze / 100)
  const gr = String(grosze % 100).padStart(2, "0")
  return `-${zl}.${gr}`
}

// 8550 → "85,50 zł"
export function formatPLN(grosze: number): string {
  const zl = Math.floor(Math.abs(grosze) / 100)
  const gr = String(Math.abs(grosze) % 100).padStart(2, "0")
  return `${zl.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${gr} zł`
}

// "-85.50" (numeric from the DB) → 8550 (grosze, positive)
export function numericToGrosze(value: string | number): number {
  const m = String(value).trim().replace(/^-/, "").match(/^(\d+)(?:\.(\d{1,2}))?/)
  if (!m) return 0
  return parseInt(m[1], 10) * 100 + (m[2] ? parseInt(m[2].padEnd(2, "0"), 10) : 0)
}

// Today's date in Europe/Warsaw as YYYY-MM-DD.
export function todayWarsaw(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" }).format(now)
}

export function isValidDateString(s: unknown, now: Date = new Date()): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return false
  return s <= todayWarsaw(now) && s >= "2000-01-01" // no future dates
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export function isValidIdempotencyKey(k: unknown): k is string {
  return typeof k === "string" && UUID_RE.test(k)
}

export type CashInput = {
  amount?: unknown
  idempotencyKey?: unknown
  categoryId?: unknown
  description?: unknown
  date?: unknown
}

export type CashRow = {
  date: string
  description: string
  counterparty: null
  amount: string
  balance: null
  category_id: string | null
  import_hash: string
}

export type ValidateResult = { ok: true; row: CashRow; grosze: number } | { ok: false; status: number; error: string }

export function buildCashRow(input: CashInput, now: Date = new Date()): ValidateResult {
  if (!isValidIdempotencyKey(input.idempotencyKey)) return { ok: false, status: 400, error: "Brak klucza zapisu — odśwież stronę." }
  const parsed = parseAmountPL(input.amount)
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error }

  let categoryId: string | null = null
  if (input.categoryId !== undefined && input.categoryId !== null && input.categoryId !== "") {
    if (typeof input.categoryId !== "string" || !UUID_RE.test(input.categoryId)) return { ok: false, status: 400, error: "Nieprawidłowa kategoria." }
    categoryId = input.categoryId
  }

  let description = CASH_DESCRIPTION
  if (input.description !== undefined && input.description !== null && input.description !== "") {
    if (typeof input.description !== "string") return { ok: false, status: 400, error: "Nieprawidłowy opis." }
    const d = input.description.trim().slice(0, MAX_DESCRIPTION_LENGTH)
    if (d) description = `${CASH_DESCRIPTION}: ${d}`
  }

  let date = todayWarsaw(now)
  if (input.date !== undefined && input.date !== null && input.date !== "") {
    if (!isValidDateString(input.date, now)) return { ok: false, status: 400, error: "Nieprawidłowa data (bez dat z przyszłości)." }
    date = input.date
  }

  return {
    ok: true,
    grosze: parsed.grosze,
    row: {
      date,
      description,
      counterparty: null,
      amount: groszeToNegativeNumeric(parsed.grosze),
      balance: null,
      category_id: categoryId,
      import_hash: `${CASH_HASH_PREFIX}${input.idempotencyKey.toLowerCase()}`,
    },
  }
}
