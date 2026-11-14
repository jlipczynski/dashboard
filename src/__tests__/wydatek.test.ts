// @vitest-environment node
import { describe, it, expect } from "vitest"
import {
  parseAmountPL,
  groszeToNegativeNumeric,
  numericToGrosze,
  formatPLN,
  todayWarsaw,
  isValidDateString,
  buildCashRow,
} from "@/lib/wydatek"

const KEY = "0f8fad5b-d9cb-469f-a165-70867728950e"

describe("parseAmountPL — formats and validation", () => {
  it.each([
    ["85", 8500],
    ["85,5", 8550],
    ["85,50", 8550],
    ["85.50", 8550],
    ["0,01", 1],
    ["1 234,56", 123456],
    ["1 234,56", 123456],
    ["12 zł", 1200],
    ["  7,05 ", 705],
    ["+10", 1000],
    ["100000", 10_000_000],
  ])("%s → %i gr", (input, grosze) => {
    expect(parseAmountPL(input)).toEqual({ ok: true, grosze })
  })

  it.each([
    ["", "Podaj kwotę."],
    ["0", "Kwota musi być większa od zera."],
    ["0,00", "Kwota musi być większa od zera."],
    ["-5", "Kwota musi być większa od zera."],
    ["85,505", "Maksymalnie 2 miejsca po przecinku."],
    ["100000,01", "Kwota za duża (limit 100 000 zł)."],
    ["1e5", "Nieprawidłowa kwota. Przykład: 85,50"],
    ["abc", "Nieprawidłowa kwota. Przykład: 85,50"],
    ["1,2,3", "Nieprawidłowa kwota. Przykład: 85,50"],
    ["Infinity", "Nieprawidłowa kwota. Przykład: 85,50"],
  ])("%s → error", (input, error) => {
    expect(parseAmountPL(input)).toEqual({ ok: false, error })
  })

  it("non-text values are rejected", () => {
    expect(parseAmountPL(undefined).ok).toBe(false)
    expect(parseAmountPL(null).ok).toBe(false)
    expect(parseAmountPL({}).ok).toBe(false)
  })
})

describe("grosze consistency (no floats)", () => {
  it("expense as a negative numeric string", () => {
    expect(groszeToNegativeNumeric(8550)).toBe("-85.50")
    expect(groszeToNegativeNumeric(1)).toBe("-0.01")
    expect(groszeToNegativeNumeric(10_000_000)).toBe("-100000.00")
  })
  it("round trip for amounts that break floats (0.1+0.2, 19.99, 1234.56)", () => {
    for (const s of ["0,10", "0,20", "0,30", "19,99", "1234,56", "33,33"]) {
      const p = parseAmountPL(s)
      if (!p.ok) throw new Error(s)
      expect(numericToGrosze(groszeToNegativeNumeric(p.grosze))).toBe(p.grosze)
    }
  })
  it("numeric from the DB → grosze", () => {
    expect(numericToGrosze("-85.5")).toBe(8550)
    expect(numericToGrosze(-12)).toBe(1200)
    expect(numericToGrosze("-0.01")).toBe(1)
  })
  it("Polish format", () => {
    expect(formatPLN(8550)).toBe("85,50 zł")
    expect(formatPLN(123456)).toBe("1 234,56 zł")
  })
})

describe("dates (Europe/Warsaw)", () => {
  it("23:30 UTC on 14.11 is already 15.11 in Warsaw", () => {
    expect(todayWarsaw(new Date("2026-11-14T23:30:00Z"))).toBe("2026-11-15")
  })
  it("no future dates, only valid ones", () => {
    const now = new Date("2026-11-14T12:00:00Z")
    expect(isValidDateString("2026-11-14", now)).toBe(true)
    expect(isValidDateString("2026-11-15", now)).toBe(false)
    expect(isValidDateString("2026-02-30", now)).toBe(false)
    expect(isValidDateString("14.11.2026", now)).toBe(false)
  })
})

describe("buildCashRow — finance_transactions row", () => {
  const now = new Date("2026-11-14T12:00:00Z")
  it("minimum: amount + key → cash, today, no category", () => {
    const r = buildCashRow({ amount: "85,50", idempotencyKey: KEY }, now)
    expect(r).toEqual({
      ok: true,
      grosze: 8550,
      row: {
        date: "2026-11-14",
        description: "Gotówka",
        counterparty: null,
        amount: "-85.50",
        balance: null,
        category_id: null,
        import_hash: `cash:${KEY}`,
      },
    })
  })
  it("optional: description, category, past date", () => {
    const r = buildCashRow({ amount: "230", idempotencyKey: KEY, description: " fryzjer ", categoryId: KEY, date: "2026-11-10" }, now)
    expect(r.ok && r.row.description).toBe("Gotówka: fryzjer")
    expect(r.ok && r.row.category_id).toBe(KEY)
    expect(r.ok && r.row.date).toBe("2026-11-10")
  })
  it("no / invalid key → 400", () => {
    expect(buildCashRow({ amount: "10" }, now)).toMatchObject({ ok: false, status: 400 })
    expect(buildCashRow({ amount: "10", idempotencyKey: "abc" }, now)).toMatchObject({ ok: false, status: 400 })
  })
  it("invalid category / date → 400", () => {
    expect(buildCashRow({ amount: "10", idempotencyKey: KEY, categoryId: "x' OR 1=1" }, now)).toMatchObject({ ok: false, status: 400 })
    expect(buildCashRow({ amount: "10", idempotencyKey: KEY, date: "2099-01-01" }, now)).toMatchObject({ ok: false, status: 400 })
  })
  it("long description is truncated to 200 characters", () => {
    const r = buildCashRow({ amount: "10", idempotencyKey: KEY, description: "x".repeat(500) }, now)
    expect(r.ok && r.row.description.length).toBe("Gotówka: ".length + 200)
  })
})
