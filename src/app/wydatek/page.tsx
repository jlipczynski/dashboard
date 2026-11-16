"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { parseAmountPL, formatPLN, todayWarsaw } from "@/lib/wydatek"

type Category = { id: string; name: string; type: "expense" | "income" | "transfer" }
type Recent = { id: string; date: string; amountGrosze: number; description: string; categoryName: string | null; key: string | null }
type Status = { kind: "idle" } | { kind: "saving" } | { kind: "ok"; text: string; undoKey: string } | { kind: "error"; text: string }

const LS_LAST = "wydatek:lastCategory"
const LS_RECENT_CATS = "wydatek:recentCategories"
const UNDO_VISIBLE_MS = 10_000
const TIMEOUT_MS = 15_000

function readLS<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}
function writeLS(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode — just don't remember */
  }
}
const newKey = () => crypto.randomUUID()

export default function WydatekPage() {
  const [amount, setAmount] = useState("")
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [recentCats, setRecentCats] = useState<string[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [more, setMore] = useState(false)
  const [description, setDescription] = useState("")
  const [date, setDate] = useState("")
  const [status, setStatus] = useState<Status>({ kind: "idle" })
  const [recent, setRecent] = useState<Recent[]>([])
  const keyRef = useRef<string>("")
  const savingRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const goLogin = () => {
    window.location.href = `/api/auth/signin?callbackUrl=${encodeURIComponent("/wydatek")}`
  }

  const loadRecent = useCallback(async () => {
    try {
      const r = await fetch("/api/wydatek", { cache: "no-store" })
      if (r.status === 401) return goLogin()
      if (r.ok) setRecent((await r.json()).recent ?? [])
    } catch {
      /* the list is optional — saving works without it */
    }
  }, [])

  useEffect(() => {
    keyRef.current = newKey()
    setCategoryId(readLS<string | null>(LS_LAST, null))
    setRecentCats(readLS<string[]>(LS_RECENT_CATS, []))
    setDate(todayWarsaw())
    inputRef.current?.focus()
    loadRecent()
    fetch("/api/finanse/categories", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { categories: [] }))
      .then((d) => setCategories((d.categories ?? []).filter((c: Category) => c.type === "expense")))
      .catch(() => {})
  }, [loadRecent])

  const catName = (id: string | null) => (id ? categories.find((c) => c.id === id)?.name ?? null : null)
  const chipIds = [null, ...recentCats.filter((id) => categories.some((c) => c.id === id)).slice(0, 4)]

  const parsed = amount.trim() ? parseAmountPL(amount) : null
  const canSave = !!parsed?.ok && status.kind !== "saving"

  async function save() {
    if (savingRef.current) return // a second tap while saving does nothing
    const p = parseAmountPL(amount)
    if (!p.ok) {
      setStatus({ kind: "error", text: p.error })
      return
    }
    savingRef.current = true
    setStatus({ kind: "saving" })
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const res = await fetch("/api/wydatek", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          idempotencyKey: keyRef.current,
          categoryId,
          description: more ? description : "",
          date: more && date !== todayWarsaw() ? date : "",
        }),
        signal: ctrl.signal,
      })
      if (res.status === 401) return goLogin()
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        // NOTHING was saved — keep the amount and the key (a retry will not create a duplicate).
        setStatus({ kind: "error", text: data.error ?? "Nie zapisano — spróbuj ponownie." })
        return
      }
      const tx = data.transaction as Recent
      const text = data.duplicate
        ? `Ten wpis był już zapisany: ${formatPLN(tx.amountGrosze)}`
        : `Zapisano ${formatPLN(tx.amountGrosze)}${catName(categoryId) ? ` · ${catName(categoryId)}` : ""}`
      setStatus({ kind: "ok", text, undoKey: keyRef.current })
      if (undoTimer.current) clearTimeout(undoTimer.current)
      undoTimer.current = setTimeout(() => setStatus((s) => (s.kind === "ok" ? { kind: "idle" } : s)), UNDO_VISIBLE_MS)

      writeLS(LS_LAST, categoryId)
      if (categoryId) {
        const next = [categoryId, ...recentCats.filter((id) => id !== categoryId)].slice(0, 6)
        setRecentCats(next)
        writeLS(LS_RECENT_CATS, next)
      }
      keyRef.current = newKey() // the next expense = a new key
      setAmount("")
      setDescription("")
      setDate(todayWarsaw())
      inputRef.current?.focus()
      loadRecent()
    } catch {
      setStatus({
        kind: "error",
        text: "Brak odpowiedzi serwera — wpis mógł nie zostać zapisany. Spróbuj ponownie (bez ryzyka duplikatu).",
      })
    } finally {
      clearTimeout(t)
      savingRef.current = false
    }
  }

  async function undo(key: string) {
    try {
      const r = await fetch(`/api/wydatek?key=${encodeURIComponent(key)}`, { method: "DELETE" })
      const d = await r.json().catch(() => ({}))
      setStatus(r.ok ? { kind: "error", text: "Cofnięto ostatni wpis." } : { kind: "error", text: d.error ?? "Nie udało się cofnąć." })
      loadRecent()
    } catch {
      setStatus({ kind: "error", text: "Brak połączenia — nie cofnięto." })
    }
  }

  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; }
        input, select, button { font-family: inherit; }
        input::placeholder { color: #D4D4D4; }
      `}</style>

      <header style={S.header}>
        <div>
          <div style={S.kicker}>Gotówka · {more && date !== todayWarsaw() ? date : "dziś"}</div>
          <h1 style={S.title}>Wydatek</h1>
        </div>
        <a href="/finanse" style={S.link}>Finanse →</a>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
        style={S.form}
      >
        <label htmlFor="amount" style={S.srOnly}>Kwota w złotych</label>
        <div style={S.amountRow}>
          <input
            id="amount"
            ref={inputRef}
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value)
              if (status.kind === "error") setStatus({ kind: "idle" })
            }}
            inputMode="decimal"
            enterKeyHint="done"
            autoComplete="off"
            autoFocus
            placeholder="0,00"
            aria-invalid={parsed ? !parsed.ok : undefined}
            aria-describedby="status"
            style={S.amount}
          />
          <span style={S.currency}>zł</span>
        </div>

        <div style={S.chips} role="radiogroup" aria-label="Kategoria">
          {chipIds.map((id) => {
            const active = categoryId === id
            return (
              <button
                key={id ?? "none"}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setCategoryId(id)}
                style={{ ...S.chip, ...(active ? S.chipActive : {}) }}
              >
                {id ? catName(id) : "Do sklasyfikowania"}
              </button>
            )
          })}
        </div>

        <button type="button" onClick={() => setMore((m) => !m)} style={S.moreBtn} aria-expanded={more}>
          {more ? "Mniej ▲" : "Więcej ▼"}
        </button>

        {more && (
          <div style={S.moreBox}>
            <label style={S.label}>
              Kategoria
              <select value={categoryId ?? ""} onChange={(e) => setCategoryId(e.target.value || null)} style={S.field}>
                <option value="">Do sklasyfikowania</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label style={S.label}>
              Opis
              <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="np. obiad" style={S.field} />
            </label>
            <label style={S.label}>
              Data
              <input type="date" value={date} max={todayWarsaw()} onChange={(e) => setDate(e.target.value)} style={S.field} />
            </label>
          </div>
        )}

        <div id="status" aria-live="polite" style={S.statusBox}>
          {status.kind === "ok" && (
            <div style={S.ok}>
              <span>✓ {status.text}</span>
              <button type="button" onClick={() => undo(status.undoKey)} style={S.undo}>Cofnij</button>
            </div>
          )}
          {status.kind === "error" && <div style={S.err}>{status.text}</div>}
          {parsed && !parsed.ok && status.kind !== "error" && <div style={S.hint}>{parsed.error}</div>}
        </div>

        {recent.length > 0 && (
          <section style={S.recent} aria-label="Ostatnie wydatki gotówkowe">
            <div style={S.kicker}>Ostatnie</div>
            {recent.map((r) => (
              <div key={r.id} style={S.recentRow}>
                <span style={S.recentDate}>{r.date.slice(5).split("-").reverse().join(".")}</span>
                <span style={S.recentDesc}>{r.categoryName ?? "Do sklasyfikowania"}{r.description !== "Gotówka" ? ` · ${r.description.replace(/^Gotówka: /, "")}` : ""}</span>
                <span style={S.recentAmt}>{formatPLN(r.amountGrosze)}</span>
              </div>
            ))}
          </section>
        )}

        <div style={S.saveBar}>
          <button type="submit" disabled={!canSave} style={{ ...S.save, ...(canSave ? {} : S.saveDisabled) }} aria-label="Zapisz wydatek">
            {status.kind === "saving" ? "Zapisuję…" : "Zapisz"}
          </button>
        </div>
      </form>
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  page: { minHeight: "100dvh", background: "#FAFAF9", color: "#171717", fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif", padding: "max(16px, env(safe-area-inset-top)) 20px 0" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 },
  kicker: { fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: 2, color: "#A3A3A3", textTransform: "uppercase" },
  title: { fontSize: 26, fontWeight: 700, letterSpacing: -0.8, margin: "4px 0 0" },
  link: { fontSize: 13, color: "#737373", textDecoration: "none", padding: "8px 0" },
  form: { display: "flex", flexDirection: "column", gap: 16, paddingBottom: "calc(96px + env(safe-area-inset-bottom))" },
  srOnly: { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" },
  amountRow: { display: "flex", alignItems: "baseline", gap: 10, background: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: 16, padding: "18px 20px" },
  amount: { flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontFamily: "'Space Mono', monospace", fontSize: 48, fontWeight: 700, color: "#171717", padding: 0 },
  currency: { fontFamily: "'Space Mono', monospace", fontSize: 22, color: "#A3A3A3" },
  chips: { display: "flex", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 44, padding: "10px 16px", borderRadius: 22, border: "1px solid #E5E5E5", background: "#FFFFFF", color: "#525252", fontSize: 14, cursor: "pointer" },
  chipActive: { background: "#F0FDF4", borderColor: "#16A34A", color: "#15803D", fontWeight: 600 },
  moreBtn: { alignSelf: "flex-start", minHeight: 44, background: "none", border: "none", color: "#737373", fontSize: 14, padding: "8px 0", cursor: "pointer" },
  moreBox: { display: "flex", flexDirection: "column", gap: 12, background: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: 14, padding: 16 },
  label: { display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#737373" },
  field: { minHeight: 44, padding: "10px 12px", border: "1px solid #E5E5E5", borderRadius: 10, background: "#FAFAF9", fontSize: 16, color: "#171717" },
  statusBox: { minHeight: 24 },
  ok: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", borderRadius: 12, padding: "10px 14px", fontSize: 15, fontWeight: 500 },
  undo: { minHeight: 40, padding: "8px 14px", borderRadius: 10, border: "1px solid #BBF7D0", background: "#FFFFFF", color: "#15803D", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  err: { background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", borderRadius: 12, padding: "10px 14px", fontSize: 14 },
  hint: { color: "#B91C1C", fontSize: 13 },
  recent: { display: "flex", flexDirection: "column", gap: 6, marginTop: 4 },
  recentRow: { display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid #EDEDED", fontSize: 14 },
  recentDate: { fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#A3A3A3", minWidth: 40 },
  recentDesc: { flex: 1, color: "#525252", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  recentAmt: { fontFamily: "'Space Mono', monospace", fontWeight: 700 },
  saveBar: { position: "fixed", left: 0, right: 0, bottom: 0, padding: "12px 20px calc(12px + env(safe-area-inset-bottom))", background: "linear-gradient(to top, #FAFAF9 70%, rgba(250,250,249,0))" },
  save: { width: "100%", minHeight: 64, borderRadius: 16, border: "none", background: "#16A34A", color: "#FFFFFF", fontSize: 20, fontWeight: 700, cursor: "pointer" },
  saveDisabled: { background: "#BBF7D0", cursor: "default" },
}
