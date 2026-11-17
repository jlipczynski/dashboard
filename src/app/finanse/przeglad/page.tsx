"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BackButton } from "@/components/dashboard/back-button";
import { CategoryIcon } from "@/components/finanse/CategoryIcon";
import { FinanseNav } from "@/components/finanse/FinanseNav";
import { formatZl } from "@/lib/finanse-period";

// Przegląd tygodniowy (sesja WIG) — mobile-first.
// Każda karta: sprawdź kategorię / osobę / jednorazowe → ✓. Potwierdzone znikają (reviewed_at).

type Tx = {
  id: string;
  date: string;
  amount: number;
  description: string | null;
  counterparty: string | null;
  merchant: string | null;
  category_id: string | null;
  subcategory_id: string | null;
  one_off: boolean;
};
type Cat = { id: string; name: string; type: string; icon: string | null; color: string | null };
type Sub = { id: string; name: string; category_id: string; kind: string | null };
type Edit = { categoryId?: string | null; subcategoryId?: string | null; oneOff?: boolean };

const PAGE = 30;
const STEPS = ["Potwierdź transakcje", "Duże wydatki", "Co jeszcze kupisz", "Prognoza miesiąca", "Zobowiązanie"];
const shortDate = (s: string) => `${Number(s.slice(8, 10))}.${s.slice(5, 7)}`;

export default function PrzegladPage() {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [total, setTotal] = useState(0);
  const [cats, setCats] = useState<Cat[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  // Weekly review wizard (Finanse 09): 1 transactions · 2 big expenses · 3 planned · 4 forecast · 5 commitment
  const [step, setStep] = useState(1);
  useEffect(() => {
    const s = Number(new URLSearchParams(window.location.search).get("step"));
    if (s >= 1 && s <= STEPS.length) setStep(s);
  }, []);
  function goTo(n: number) {
    const s = Math.min(STEPS.length, Math.max(1, n));
    setStep(s);
    const url = new URL(window.location.href);
    url.searchParams.set("step", String(s));
    window.history.replaceState(null, "", url.toString());
    window.scrollTo(0, 0);
  }
  // Erste e-mail alerts (Finanse 08): status of the last import + "Pobierz alerty teraz"
  type ImportStatus = { ran_at: string; fetched: number; inserted: number; unparsed: number } | null;
  const [lastImport, setLastImport] = useState<ImportStatus>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  async function loadImportStatus() {
    try {
      const r = await fetch("/api/finanse/email-import", { cache: "no-store" });
      if (r.ok) setLastImport((await r.json()).last ?? null);
    } catch {}
  }
  useEffect(() => {
    loadImportStatus();
  }, []);

  async function importNow() {
    setImporting(true);
    setImportMsg(null);
    try {
      const r = await fetch("/api/finanse/email-import", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setImportMsg(d.error || "Import nie powiódł się");
      else if (d.dryRun) {
        setImportMsg(
          `Tryb próbny — nic nie zapisano. Maile: ${d.fetched}, zostałoby dodanych: ${d.wouldInsert}, już w bazie: ${d.linked_existing}, niepewne: ${d.uncertain}, nierozpoznane: ${d.unparsed}`
        );
      } else {
        setImportMsg(
          `Pobrano maili: ${d.fetched}, nowe: ${d.inserted}, już w bazie: ${d.linked_existing}, niepewne (do sprawdzenia): ${d.uncertain}, nierozpoznane: ${d.unparsed}`
        );
        if (d.inserted > 0) load();
      }
      loadImportStatus();
    } catch {
      setImportMsg("Import nie powiódł się");
    } finally {
      setImporting(false);
    }
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/finanse/review");
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      setTxs(d.transactions);
      setTotal(d.total);
      setCats(d.categories);
      setSubs(d.subcategories);
    } catch {
      setError("Nie udało się pobrać transakcji.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const catById = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
  const visible = txs.slice(0, PAGE);

  function current(t: Tx) {
    const e = edits[t.id] ?? {};
    return {
      categoryId: e.categoryId !== undefined ? e.categoryId : t.category_id,
      subcategoryId: e.subcategoryId !== undefined ? e.subcategoryId : t.subcategory_id,
      oneOff: e.oneOff !== undefined ? e.oneOff : t.one_off,
    };
  }

  function patch(id: string, e: Edit) {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...e } }));
  }

  async function confirm(ids: string[]) {
    if (ids.length === 0 || saving) return;
    setSaving(true);
    setError(null);
    const items = ids.map((id) => ({ id, ...(edits[id] ?? {}) }));
    try {
      const r = await fetch("/api/finanse/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const d = await r.json().catch(() => ({}));
      const failed = new Set<string>(r.ok ? [] : (d.failed ?? ids));
      const ok = ids.filter((id) => !failed.has(id));
      setTxs((prev) => prev.filter((t) => !ok.includes(t.id)));
      setTotal((n) => Math.max(0, n - ok.length));
      setDone((n) => n + ok.length);
      setEdits((prev) => {
        const next = { ...prev };
        ok.forEach((id) => delete next[id]);
        return next;
      });
      if (failed.size > 0) setError(`Nie zapisano ${failed.size} pozycji — spróbuj ponownie.`);
      if (ok.length > 0 && txs.length - ok.length === 0 && total - ok.length > 0) load();
    } catch {
      setError("Błąd zapisu — spróbuj ponownie.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="mx-auto max-w-xl px-4 py-5">
        <BackButton />
        <FinanseNav active="przeglad" />
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sesja WIG · finanse</p>
            <h1 className="mt-1 text-2xl font-bold text-foreground">Przegląd wydatków</h1>
          </div>
          <Link href="/finanse/dashboard" className="text-sm font-medium text-emerald-700 hover:underline">
            Dashboard →
          </Link>
        </div>
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">
              Krok {step}/{STEPS.length} · {STEPS[step - 1]}
            </span>
            {step > 1 && (
              <button onClick={() => goTo(step - 1)} className="hover:text-foreground">
                ← Wstecz
              </button>
            )}
          </div>
          <div className="mt-1.5 flex gap-1" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full ${i < step ? "bg-emerald-700" : "bg-muted"}`} />
            ))}
          </div>
        </div>

        {step > 1 ? (
          <CoachSteps step={step} goTo={goTo} />
        ) : (
        <>
        <p className="mt-2 text-sm text-muted-foreground">
          {loading ? "Ładowanie…" : `${total} do sprawdzenia`}
          {done > 0 && ` · ${done} potwierdzonych w tej sesji`}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Sprawdź kategorię, osobę i czy to wydatek jednorazowy. ✓ zatwierdza pozycję — znika z listy.
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          <span>
            {lastImport
              ? `Ostatni import: ${new Date(lastImport.ran_at).toLocaleString("pl-PL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}, nowe: ${lastImport.inserted}, nierozpoznane: ${lastImport.unparsed}`
              : "Alerty Erste: jeszcze nie importowano"}
          </span>
          <button
            onClick={importNow}
            disabled={importing}
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          >
            {importing ? "Pobieram…" : "Pobierz alerty teraz"}
          </button>
          {importMsg && <span className="w-full text-foreground">{importMsg}</span>}
        </div>

        {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {!loading && total === 0 && (
          <div className="mt-8 rounded-2xl border border-border bg-card p-6 text-center">
            <p className="text-lg font-semibold text-foreground">Wszystko przejrzane ✓</p>
            <p className="mt-1 text-sm text-muted-foreground">Transakcje potwierdzone. Teraz duże wydatki i plan na resztę miesiąca.</p>
            <button onClick={() => goTo(2)} className="mt-4 inline-block rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">
              Dalej: duże wydatki →
            </button>
          </div>
        )}

        <ul className="mt-4 flex flex-col gap-3">
          {visible.map((t) => {
            const c = current(t);
            const cat = c.categoryId ? catById.get(c.categoryId) : undefined;
            const catSubs = subs.filter((s) => s.category_id === c.categoryId);
            const title = t.merchant || t.counterparty || t.description || "—";
            return (
              <li key={t.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start gap-3">
                  <CategoryIcon icon={cat?.icon ?? null} color={cat?.color ?? "#9CA3AF"} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">{title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {shortDate(t.date)}
                      {t.description && t.description !== title ? ` · ${t.description}` : ""}
                    </p>
                  </div>
                  <span className={`whitespace-nowrap font-mono text-base font-bold tabular-nums ${t.amount > 0 ? "text-emerald-700" : "text-foreground"}`}>
                    {t.amount > 0 ? "+" : ""}
                    {formatZl(t.amount)}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <select
                    aria-label="Kategoria"
                    value={c.categoryId ?? ""}
                    onChange={(e) => patch(t.id, { categoryId: e.target.value || null, subcategoryId: null })}
                    className="min-w-0 rounded-lg border border-border bg-background px-2 py-2 text-sm"
                  >
                    <option value="">— bez kategorii —</option>
                    {cats.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Podkategoria"
                    value={c.subcategoryId ?? ""}
                    onChange={(e) => patch(t.id, { subcategoryId: e.target.value || null })}
                    disabled={catSubs.length === 0}
                    className="min-w-0 rounded-lg border border-border bg-background px-2 py-2 text-sm disabled:opacity-50"
                  >
                    <option value="">— podkategoria —</option>
                    {catSubs.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <label className="col-span-2 flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-2 text-sm">
                    <input type="checkbox" checked={c.oneOff} onChange={(e) => patch(t.id, { oneOff: e.target.checked })} className="h-4 w-4" />
                    Jednorazowy
                  </label>
                </div>

                <button
                  onClick={() => confirm([t.id])}
                  disabled={saving}
                  className="mt-3 w-full rounded-xl bg-emerald-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  ✓ Zgadza się
                </button>
              </li>
            );
          })}
        </ul>
        {!loading && total > 0 && (
          <button onClick={() => goTo(2)} className="mt-4 w-full rounded-xl border border-border bg-card py-2.5 text-sm text-muted-foreground hover:text-foreground">
            Pomiń na razie → krok 2
          </button>
        )}
        </>
        )}
      </div>

      {step === 1 && visible.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-card/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <p className="flex-1 text-xs text-muted-foreground">
              Na ekranie {visible.length} z {total}
            </p>
            <button
              onClick={() => confirm(visible.map((t) => t.id))}
              disabled={saving}
              className="rounded-xl bg-[#1F3A2C] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Zapisuję…" : `Wszystko się zgadza (${visible.length})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Steps 2–5: the coach (Finanse 09) ───────────────────────────────── */

type BigExp = { id: string; date: string; amount: number; payee: string; categoryId: string | null; categoryName: string | null };
type PlannedItem = { id: string; name: string; amount: number; category_id: string | null; status: "planned" | "bought" | "dropped" };
type CoachData = {
  today: string;
  status: {
    spent: number;
    spentRecurring: number;
    plannedRemaining: number;
    forecast: number;
    limit: number;
    left: number;
    overBy: number;
    daysLeft: number;
    perDayLeft: number;
  };
  big: BigExp[];
  planned: PlannedItem[];
  thisWeek: { commitment: string | null; completed_at: string | null } | null;
  lastCommitment: { week_start: string; commitment: string | null } | null;
  discretionaryTop: { category: string; subcategory: string; amount: number }[];
  goal: { monthly_limit: number; status: "pending" | "approved" };
};

function LimitEditor({ goal, onSaved }: { goal: CoachData["goal"]; onSaved: () => void }) {
  const [value, setValue] = useState(String(goal.monthly_limit));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function save(body: Record<string, unknown>) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/finanse/coach/goal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setMsg(d.error || "Nie zapisano");
      else onSaved();
    } finally {
      setBusy(false);
    }
  }
  const pending = goal.status !== "approved";
  return (
    <div className={`mt-3 rounded-xl border p-3 ${pending ? "border-amber-300 bg-amber-50" : "border-border bg-card"}`}>
      <p className="text-xs font-semibold text-foreground">
        Miesięczny limit wydatków · <span className={pending ? "text-amber-800" : "text-emerald-700"}>{pending ? "Do zatwierdzenia" : "Zatwierdzony"}</span>
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        Wartość robocza — to Twoja decyzja. 20 000 zł z Visionary OS to cel dochodu pasywnego, nie limit wydatków.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" aria-label="Limit miesięczny w zł" className="w-32 rounded-lg border border-border bg-background px-2 py-1.5 text-sm" />
        <button
          onClick={() => save({ monthlyLimit: value })}
          disabled={busy || !value.trim() || Number(value.replace(/\s/g, "").replace(",", ".")) === goal.monthly_limit}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs disabled:opacity-40"
        >
          Zapisz kwotę
        </button>
        {pending && (
          <button onClick={() => save({ status: "approved" })} disabled={busy} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
            Zatwierdzam {formatZl(goal.monthly_limit)}
          </button>
        )}
      </div>
      {msg && <p className="mt-1 text-xs text-red-700">{msg}</p>}
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
const pillCls = (on: boolean) =>
  `flex-1 rounded-lg border px-2 py-2 text-sm ${on ? "border-emerald-700 bg-emerald-700 font-semibold text-white" : "border-border bg-background text-foreground"}`;

function CoachBubble({ text, loading, onAsk }: { text: string | null; loading: boolean; onAsk: (answer?: string) => void }) {
  const [answer, setAnswer] = useState("");
  return (
    <div className="mt-3 rounded-xl border border-[#3B5A48]/20 bg-[#1F3A2C]/5 p-3">
      <p className="text-[11px] font-bold uppercase tracking-widest text-[#1F3A2C]">Coach</p>
      <p className="mt-1 whitespace-pre-line text-sm text-foreground">{loading ? "Myślę…" : text ?? "—"}</p>
      <div className="mt-2 flex gap-2">
        <input
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Odpowiedz coachowi…"
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
        />
        <button
          onClick={() => {
            onAsk(answer);
            setAnswer("");
          }}
          disabled={loading || !answer.trim()}
          className="rounded-lg bg-[#1F3A2C] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          Wyślij
        </button>
      </div>
    </div>
  );
}

function CoachSteps({ step, goTo }: { step: number; goTo: (n: number) => void }) {
  const [data, setData] = useState<CoachData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [talk, setTalk] = useState<Record<string, { text: string | null; loading: boolean }>>({});
  const [cats, setCats] = useState<{ id: string; name: string; type: string }[]>([]);
  // step 2 form
  const [necessary, setNecessary] = useState<"yes" | "partly" | "no" | null>(null);
  const [recurring, setRecurring] = useState<boolean | null>(null);
  const [horizon, setHorizon] = useState("");
  const [plan, setPlan] = useState("");
  // step 3 form
  const [pName, setPName] = useState("");
  const [pAmount, setPAmount] = useState("");
  const [pCat, setPCat] = useState("");
  // step 5
  const [kept, setKept] = useState<"yes" | "partly" | "no" | null>(null);
  const [commitment, setCommitment] = useState("");
  const [finished, setFinished] = useState(false);

  async function reload() {
    try {
      const r = await fetch("/api/finanse/coach/status", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setData(d);
    } catch {
      setError("Nie udało się pobrać danych coacha.");
    }
  }
  useEffect(() => {
    reload();
    fetch("/api/finanse/categories")
      .then((r) => r.json())
      .then((d) => setCats((d.categories ?? []).filter((c: { type: string }) => c.type === "expense")))
      .catch(() => {});
  }, []);

  async function ask(key: string, body: { step: number; transactionId?: string; answer?: string }) {
    setTalk((t) => ({ ...t, [key]: { text: t[key]?.text ?? null, loading: true } }));
    try {
      const r = await fetch("/api/finanse/coach/talk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      setTalk((t) => ({ ...t, [key]: { text: r.ok ? d.text : d.error || "Coach chwilowo niedostępny.", loading: false } }));
    } catch {
      setTalk((t) => ({ ...t, [key]: { text: "Coach chwilowo niedostępny.", loading: false } }));
    }
  }

  async function post(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d.error || "Nie zapisano");
        return null;
      }
      await reload();
      return d;
    } finally {
      setBusy(false);
    }
  }

  const current = step === 2 ? data?.big[0] ?? null : null;
  // Ask the coach automatically once per screen (step 2: per expense)
  const autoKey = step === 2 ? (current ? `big:${current.id}` : null) : step === 4 || step === 5 ? `step:${step}` : null;
  useEffect(() => {
    if (!data || !autoKey || talk[autoKey]) return;
    ask(autoKey, { step, transactionId: current?.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, autoKey]);
  useEffect(() => {
    setNecessary(null);
    setRecurring(null);
    setHorizon("");
    setPlan("");
  }, [current?.id]);

  if (error && !data) return <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>;
  if (!data) return <p className="mt-6 text-sm text-muted-foreground">Ładowanie…</p>;
  const s = data.status;
  const over = s.overBy > 0;
  const pct = Math.min(100, (s.spent / s.limit) * 100);
  const barColor = s.spent > s.limit ? "bg-red-600" : s.spent >= 0.8 * s.limit ? "bg-amber-500" : "bg-emerald-600";
  const nextBtn = (label: string, to: number) => (
    <button onClick={() => goTo(to)} className="mt-5 w-full rounded-xl bg-[#1F3A2C] py-3 text-sm font-semibold text-white">
      {label}
    </button>
  );

  return (
    <div className="mt-4">
      {error && <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {step === 2 && (
        <section>
          <p className="text-sm text-muted-foreground">
            Wydatki ≥ 1 000 zł w tym miesiącu bez decyzji: <span className="font-semibold text-foreground">{data.big.length}</span>
          </p>
          {current ? (
            <div className="mt-3 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{current.payee}</p>
                  <p className="text-xs text-muted-foreground">
                    {current.categoryName ?? "bez kategorii"} · {current.date.slice(8, 10)}.{current.date.slice(5, 7)}
                  </p>
                </div>
                <span className="whitespace-nowrap font-mono text-lg font-bold tabular-nums text-foreground">{formatZl(current.amount)}</span>
              </div>
              <CoachBubble
                text={talk[`big:${current.id}`]?.text ?? null}
                loading={!!talk[`big:${current.id}`]?.loading}
                onAsk={(answer) => ask(`big:${current.id}`, { step: 2, transactionId: current.id, answer })}
              />
              <p className="mt-4 text-xs font-semibold text-foreground">Był konieczny?</p>
              <div className="mt-1 flex gap-2">
                {(["yes", "partly", "no"] as const).map((v) => (
                  <button key={v} onClick={() => setNecessary(v)} className={pillCls(necessary === v)}>
                    {v === "yes" ? "Tak" : v === "partly" ? "Częściowo" : "Nie"}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs font-semibold text-foreground">Wróci?</p>
              <div className="mt-1 flex gap-2">
                <button onClick={() => setRecurring(true)} className={pillCls(recurring === true)}>Tak</button>
                <button onClick={() => setRecurring(false)} className={pillCls(recurring === false)}>Nie</button>
              </div>
              {recurring && (
                <div className="mt-3 space-y-2">
                  <label className="block text-xs text-muted-foreground">
                    Do kiedy go ponosimy?
                    <input type="date" value={horizon} onChange={(e) => setHorizon(e.target.value)} className={`${inputCls} mt-1`} />
                  </label>
                  <textarea
                    value={plan}
                    onChange={(e) => setPlan(e.target.value)}
                    placeholder="Plan ograniczenia (konkretnie: co, od kiedy, o ile)"
                    rows={2}
                    className={inputCls}
                  />
                </div>
              )}
              <button
                onClick={async () => {
                  const ok = await post("/api/finanse/coach/decision", "POST", {
                    transactionId: current.id,
                    necessary,
                    recurring,
                    horizonUntil: recurring ? horizon : undefined,
                    plan: plan || undefined,
                  });
                  if (ok) setError(null);
                }}
                disabled={busy || !necessary || recurring === null}
                className="mt-4 w-full rounded-xl bg-emerald-700 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                Zapisz decyzję
              </button>
            </div>
          ) : (
            <div className="mt-3 rounded-2xl border border-border bg-card p-5 text-center">
              <p className="font-semibold text-foreground">Wszystkie duże wydatki omówione ✓</p>
            </div>
          )}
          {nextBtn(current ? "Pomiń na razie → krok 3" : "Dalej: co jeszcze kupisz →", 3)}
        </section>
      )}

      {step === 3 && (
        <section>
          <p className="text-sm text-muted-foreground">Co jeszcze kupisz w tym miesiącu? Wpisz wszystko, co już wiesz — prognoza to policzy.</p>
          <ul className="mt-3 flex flex-col gap-2">
            {data.planned.map((p) => (
              <li key={p.id} className={`flex items-center gap-2 rounded-xl border border-border bg-card p-3 ${p.status !== "planned" ? "opacity-60" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-medium ${p.status === "dropped" ? "line-through" : ""}`}>{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.status === "planned" ? "planowane" : p.status === "bought" ? "kupione" : "rezygnacja"}
                  </p>
                </div>
                <span className="font-mono text-sm tabular-nums">{formatZl(p.amount)}</span>
                {p.status === "planned" && (
                  <button onClick={() => post("/api/finanse/coach/planned", "PATCH", { id: p.id, status: "bought" })} disabled={busy} className="rounded-lg border border-border px-2 py-1 text-xs">
                    Kupione
                  </button>
                )}
                <button onClick={() => post(`/api/finanse/coach/planned?id=${p.id}`, "DELETE")} disabled={busy} className="rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground" aria-label={`Usuń ${p.name}`}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-dashed border-border p-3">
            <input value={pName} onChange={(e) => setPName(e.target.value)} placeholder="Nazwa, np. Prezenty świąteczne" className={`${inputCls} col-span-2`} />
            <input value={pAmount} onChange={(e) => setPAmount(e.target.value)} placeholder="Kwota zł" inputMode="decimal" className={inputCls} />
            <select value={pCat} onChange={(e) => setPCat(e.target.value)} className={inputCls} aria-label="Kategoria">
              <option value="">— kategoria —</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button
              onClick={async () => {
                const ok = await post("/api/finanse/coach/planned", "POST", { name: pName, amount: Number(pAmount.replace(/\s/g, "").replace(",", ".")), categoryId: pCat || null });
                if (ok) {
                  setPName("");
                  setPAmount("");
                  setPCat("");
                }
              }}
              disabled={busy || !pName.trim() || !pAmount.trim()}
              className="col-span-2 rounded-lg bg-emerald-700 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Dodaj
            </button>
          </div>
          <p className="mt-3 text-sm text-foreground">
            Planowane: <span className="font-mono font-semibold">{formatZl(s.plannedRemaining)}</span> · prognoza{" "}
            <span className={`font-mono font-semibold ${over ? "text-red-600" : ""}`}>{formatZl(s.forecast)}</span> / {formatZl(s.limit)}
          </p>
          <CoachBubble
            text={talk["step:3"]?.text ?? null}
            loading={!!talk["step:3"]?.loading}
            onAsk={(answer) => ask("step:3", { step: 3, answer })}
          />
          {!talk["step:3"] && (
            <button onClick={() => ask("step:3", { step: 3 })} className="mt-2 text-xs font-medium text-emerald-700 hover:underline">
              Zapytaj coacha o te zakupy
            </button>
          )}
          {nextBtn("Dalej: prognoza →", 4)}
        </section>
      )}

      {step === 4 && (
        <section>
          <div className="rounded-2xl bg-[#1F3A2C] p-5 text-[#F4F1EC]">
            <p className="text-xs font-bold uppercase tracking-widest text-[#A9C9B5]">
              Koszty życia · limit {data.goal.status === "approved" ? "zatwierdzony" : "roboczy (do zatwierdzenia)"}
            </p>
            <p className="mt-2 font-mono text-3xl font-bold">
              {formatZl(s.spent)} <span className="text-base font-normal text-[#C9D8CE]">/ {formatZl(s.limit)}</span>
            </p>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#3B5A48]">
              <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-3 text-sm text-[#C9D8CE]">
              Planowane {formatZl(s.plannedRemaining)} · prognoza <span className="font-mono font-semibold text-[#F4F1EC]">{formatZl(s.forecast)}</span>
            </p>
            {over ? (
              <p className="mt-2 text-lg font-bold text-red-300">
                {data.goal.status === "approved" ? `Przekroczysz o ${formatZl(s.overBy)}` : `${formatZl(s.overBy)} powyżej limitu roboczego`}
              </p>
            ) : (
              <p className="mt-2 text-lg font-bold text-[#8FD1A8]">
                Zostało {formatZl(s.left)} na {s.daysLeft} dni = {formatZl(s.perDayLeft)} dziennie
              </p>
            )}
          </div>
          <LimitEditor goal={data.goal} onSaved={reload} />
          {data.discretionaryTop.length > 0 && (
            <div className="mt-3 rounded-xl border border-border bg-card p-3">
              <p className="text-xs font-semibold text-foreground">Uznaniowe w tym miesiącu — tu najłatwiej ciąć:</p>
              <ul className="mt-1 text-sm">
                {data.discretionaryTop.map((d) => (
                  <li key={`${d.category}/${d.subcategory}`} className="flex justify-between gap-2">
                    <span className="truncate text-muted-foreground">
                      {d.category} / {d.subcategory}
                    </span>
                    <span className="font-mono tabular-nums">{formatZl(d.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <CoachBubble
            text={talk["step:4"]?.text ?? null}
            loading={!!talk["step:4"]?.loading}
            onAsk={(answer) => ask("step:4", { step: 4, answer })}
          />
          {nextBtn("Dalej: zobowiązanie →", 5)}
        </section>
      )}

      {step === 5 && (
        <section>
          {finished ? (
            <div className="rounded-2xl border border-border bg-card p-6 text-center">
              <p className="text-lg font-semibold text-foreground">Przegląd zakończony ✓</p>
              <p className="mt-1 text-sm text-muted-foreground">Zobowiązanie: „{commitment}”. Wrócimy do niego za tydzień.</p>
              <Link href="/finanse/dashboard" className="mt-4 inline-block rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">
                Zobacz dashboard
              </Link>
            </div>
          ) : (
            <>
              {data.lastCommitment?.commitment && (
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-sm text-foreground">
                    Czy dotrzymałeś: <span className="font-semibold">„{data.lastCommitment.commitment}”</span>?
                  </p>
                  <div className="mt-2 flex gap-2">
                    {(["yes", "partly", "no"] as const).map((v) => (
                      <button key={v} onClick={() => setKept(v)} className={pillCls(kept === v)}>
                        {v === "yes" ? "Tak" : v === "partly" ? "Częściowo" : "Nie"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <CoachBubble
                text={talk["step:5"]?.text ?? null}
                loading={!!talk["step:5"]?.loading}
                onAsk={(answer) => ask("step:5", { step: 5, answer })}
              />
              <label className="mt-4 block text-xs font-semibold text-foreground">
                Jedno zobowiązanie na ten tydzień
                <input
                  value={commitment}
                  onChange={(e) => setCommitment(e.target.value)}
                  placeholder="np. bez restauracji w dni robocze"
                  className={`${inputCls} mt-1`}
                />
              </label>
              <button
                onClick={async () => {
                  const coachSummary = [talk["step:4"]?.text, talk["step:5"]?.text].filter(Boolean).join("\n\n") || undefined;
                  const ok = await post("/api/finanse/coach/review", "POST", { commitment, previousKept: kept ?? undefined, coachSummary });
                  if (ok) setFinished(true);
                }}
                disabled={busy || !commitment.trim() || (!!data.lastCommitment?.commitment && !kept)}
                className="mt-4 w-full rounded-xl bg-[#1F3A2C] py-3 text-sm font-semibold text-white disabled:opacity-40"
              >
                Zakończ przegląd
              </button>
              {data.thisWeek?.completed_at && (
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Przegląd tego tygodnia już zapisany („{data.thisWeek.commitment}”) — zapis go nadpisze.
                </p>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
