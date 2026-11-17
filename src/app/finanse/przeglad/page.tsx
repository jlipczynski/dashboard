"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BackButton } from "@/components/dashboard/back-button";
import { CategoryIcon } from "@/components/finanse/CategoryIcon";
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
  person: string | null;
  one_off: boolean;
};
type Cat = { id: string; name: string; type: string; icon: string | null; color: string | null };
type Sub = { id: string; name: string; category_id: string; kind: string | null };
type Edit = { categoryId?: string | null; subcategoryId?: string | null; person?: string | null; oneOff?: boolean };

const PAGE = 30;
const shortDate = (s: string) => `${Number(s.slice(8, 10))}.${s.slice(5, 7)}`;

export default function PrzegladPage() {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [total, setTotal] = useState(0);
  const [cats, setCats] = useState<Cat[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [persons, setPersons] = useState<string[]>([]);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);
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
      else {
        setImportMsg(`Pobrano maili: ${d.fetched}, nowe: ${d.inserted}, nierozpoznane: ${d.unparsed}`);
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
      setPersons(d.persons);
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
      person: e.person !== undefined ? e.person : t.person,
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
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sesja WIG · finanse</p>
            <h1 className="mt-1 text-2xl font-bold text-foreground">Przegląd wydatków</h1>
          </div>
          <Link href="/finanse/dashboard" className="text-sm font-medium text-emerald-700 hover:underline">
            Dashboard →
          </Link>
        </div>
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
            <p className="mt-1 text-sm text-muted-foreground">Lead 1 zaliczony na ten tydzień.</p>
            <Link href="/finanse/dashboard" className="mt-4 inline-block rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">
              Zobacz dashboard
            </Link>
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
                  <select
                    aria-label="Osoba"
                    value={c.person ?? ""}
                    onChange={(e) => patch(t.id, { person: e.target.value || null })}
                    className="min-w-0 rounded-lg border border-border bg-background px-2 py-2 text-sm"
                  >
                    <option value="">— osoba —</option>
                    {persons.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-2 text-sm">
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
      </div>

      {visible.length > 0 && (
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
