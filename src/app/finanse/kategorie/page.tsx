"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BackButton } from "@/components/dashboard/back-button";
import { CategoryIcon } from "@/components/finanse/CategoryIcon";
import { FinanseNav } from "@/components/finanse/FinanseNav";
import { CATEGORY_COLORS, deleteGuard, type CategoryType, type Kind } from "@/lib/finanse-taxonomy";

// /finanse/kategorie — Jan maintains the taxonomy himself: categories, subcategories, kinds,
// merging and moving. All writes go through /api/finanse/taxonomy.

type Sub = {
  id: string;
  name: string;
  category_id: string;
  kind: Kind | null;
  sort_order: number;
  txCount: number;
  trashCount: number;
  ruleCount: number;
};
type Cat = {
  id: string;
  name: string;
  type: CategoryType;
  icon: string | null;
  color: string | null;
  sort_order: number;
  txCount: number;
  trashCount: number;
  ruleCount: number;
  monthAmount: number;
  subcategories: Sub[];
};
type Tree = { month: string; categories: Cat[]; icons: string[] };

const GROUPS: { type: CategoryType; label: string }[] = [
  { type: "expense", label: "Wydatki" },
  { type: "income", label: "Przychody" },
  { type: "transfer", label: "Przelewy własne" },
];
const KIND_META: Record<Kind | "none", { short: string; label: string; chip: string }> = {
  fixed: { short: "S", label: "Stałe", chip: "bg-slate-100 text-slate-700" },
  essential: { short: "N", label: "Niezbędne", chip: "bg-emerald-50 text-emerald-800" },
  discretionary: { short: "U", label: "Uznaniowe", chip: "bg-amber-50 text-amber-800" },
  none: { short: "?", label: "Bez rodzaju", chip: "bg-muted text-muted-foreground" },
};
const TYPE_LABEL: Record<CategoryType, string> = { expense: "Wydatek", income: "Przychód", transfer: "Przelew własny" };

const zl = (v: number) => `${String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} zł`;
const inputCls =
  "rounded-lg border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500";
const btnCls = "rounded-lg border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40";
const primaryCls = "rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50";

type Merge = { entity: "category" | "subcategory"; fromId: string; toId: string; summary: string | null };

export default function FinanseKategoriePage() {
  const [tree, setTree] = useState<Tree | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [onlyNoKind, setOnlyNoKind] = useState(false);
  const [editCat, setEditCat] = useState<{ id: string; name: string; type: CategoryType; icon: string; color: string } | null>(null);
  const [editSub, setEditSub] = useState<{ id: string; name: string; kind: Kind | null; category_id: string } | null>(null);
  const [merge, setMerge] = useState<Merge | null>(null);
  const [newSub, setNewSub] = useState<Record<string, { name: string; kind: Kind | "" }>>({});
  const [newCat, setNewCat] = useState<{ name: string; type: CategoryType }>({ name: "", type: "expense" });

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/finanse/taxonomy", { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      setTree(await r.json());
    } catch {
      setError("Nie udało się pobrać kategorii. Odśwież stronę.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function call(method: string, body?: unknown, query = "") {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/finanse/taxonomy${query}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d.error || "Nie udało się zapisać");
        return null;
      }
      await load();
      return d;
    } finally {
      setBusy(false);
    }
  }

  async function checkMerge(m: Merge) {
    if (!m.toId) return;
    setBusy(true);
    setError(null);
    const r = await fetch("/api/finanse/taxonomy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "merge", entity: m.entity, fromId: m.fromId, toId: m.toId, dryRun: true }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(d.error || "Nie udało się sprawdzić scalenia");
    setMerge({ ...m, summary: d.plan.summary });
  }

  const cats = tree?.categories ?? [];
  const allSubs = cats.flatMap((c) => c.subcategories.map((s) => ({ ...s, catName: c.name })));
  const noKindCount = cats.flatMap((c) => c.subcategories).filter((s) => !s.kind).length;

  const mergePanel = (entity: "category" | "subcategory", fromId: string) =>
    merge?.entity === entity && merge.fromId === fromId && (
      <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-blue-800">Scal do:</span>
          <select
            value={merge.toId}
            onChange={(e) => setMerge({ ...merge, toId: e.target.value, summary: null })}
            className={inputCls}
          >
            <option value="">— wybierz —</option>
            {entity === "category"
              ? cats.filter((c) => c.id !== fromId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)
              : cats.map((c) => (
                  <optgroup key={c.id} label={c.name}>
                    {c.subcategories.filter((s) => s.id !== fromId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </optgroup>
                ))}
          </select>
          {!merge.summary && (
            <button onClick={() => checkMerge(merge)} disabled={!merge.toId || busy} className={btnCls}>
              Sprawdź
            </button>
          )}
          <button onClick={() => setMerge(null)} className={btnCls}>Anuluj</button>
        </div>
        {merge.summary && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="text-blue-900">{merge.summary}</p>
            <button
              onClick={async () => {
                const ok = await call("POST", { action: "merge", entity, fromId, toId: merge.toId });
                if (ok) setMerge(null);
              }}
              disabled={busy}
              className={primaryCls}
            >
              Scal
            </button>
          </div>
        )}
      </div>
    );

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <BackButton />
        <FinanseNav active="kategorie-strona" />
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Finanse · taksonomia</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">Kategorie</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Liczniki bez kosza · suma za {tree?.month ?? "bieżący miesiąc"} ·{" "}
              <Link href="/finanse/dashboard" className="hover:underline">Dashboard</Link>
            </p>
          </div>
          <button
            onClick={() => setOnlyNoKind((v) => !v)}
            className={`rounded-full border px-4 py-2 text-sm ${
              onlyNoKind ? "border-emerald-700 bg-emerald-700 font-semibold text-white" : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            Bez rodzaju ({noKindCount})
          </button>
        </div>

        {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {!tree && !error && <p className="mt-6 text-sm text-muted-foreground">Ładowanie…</p>}

        {GROUPS.map((g) => {
          const groupCats = cats
            .filter((c) => c.type === g.type)
            .filter((c) => !onlyNoKind || c.subcategories.some((s) => !s.kind));
          if (onlyNoKind && groupCats.length === 0) return null;
          return (
            <section key={g.type} className="mt-6">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{g.label}</h2>
              <div className="mt-2 space-y-3">
                {groupCats.map((c, idx) => {
                  const guard = deleteGuard({ transactions: c.txCount, trashed: c.trashCount, rules: c.ruleCount, subcategories: c.subcategories.length });
                  const editing = editCat?.id === c.id;
                  const subs = onlyNoKind ? c.subcategories.filter((s) => !s.kind) : c.subcategories;
                  const ns = newSub[c.id] ?? { name: "", kind: "" };
                  return (
                    <div key={c.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                      <div className="flex flex-wrap items-center gap-3">
                        <CategoryIcon icon={c.icon} color={c.color} size={36} />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-foreground">{c.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {c.txCount} transakcji{c.trashCount ? ` (+${c.trashCount} w koszu)` : ""} · {c.ruleCount} reguł ·{" "}
                            <span className="font-mono">{zl(c.monthAmount)}</span> w tym miesiącu
                          </p>
                        </div>
                        {!onlyNoKind && (
                          <div className="flex flex-wrap items-center gap-1">
                            <button onClick={() => call("PATCH", { entity: "category", id: c.id, move: "up" })} disabled={busy || idx === 0} className={btnCls} aria-label="W górę">↑</button>
                            <button onClick={() => call("PATCH", { entity: "category", id: c.id, move: "down" })} disabled={busy || idx === groupCats.length - 1} className={btnCls} aria-label="W dół">↓</button>
                            <button
                              onClick={() => setEditCat(editing ? null : { id: c.id, name: c.name, type: c.type, icon: c.icon ?? "dots", color: c.color ?? "#8A847E" })}
                              className={btnCls}
                            >
                              Edytuj
                            </button>
                            <button onClick={() => setMerge({ entity: "category", fromId: c.id, toId: "", summary: null })} className={btnCls}>Scal…</button>
                            <button
                              onClick={() => confirm(`Usunąć kategorię „${c.name}”?`) && call("DELETE", undefined, `?entity=category&id=${c.id}`)}
                              disabled={busy || !guard.ok}
                              title={guard.ok ? "Usuń kategorię" : guard.reason}
                              className={btnCls}
                            >
                              Usuń
                            </button>
                          </div>
                        )}
                      </div>

                      {editing && editCat && (
                        <div className="mt-3 space-y-3 rounded-lg border border-border bg-background p-3">
                          <div className="flex flex-wrap gap-2">
                            <input value={editCat.name} onChange={(e) => setEditCat({ ...editCat, name: e.target.value })} className={`${inputCls} flex-1`} aria-label="Nazwa" />
                            <select value={editCat.type} onChange={(e) => setEditCat({ ...editCat, type: e.target.value as CategoryType })} className={inputCls} aria-label="Typ">
                              {GROUPS.map((x) => <option key={x.type} value={x.type}>{TYPE_LABEL[x.type]}</option>)}
                            </select>
                          </div>
                          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Ikona">
                            {(tree?.icons ?? []).map((ic) => (
                              <button
                                key={ic}
                                onClick={() => setEditCat({ ...editCat, icon: ic })}
                                className={`rounded-xl p-0.5 ${editCat.icon === ic ? "ring-2 ring-emerald-600" : ""}`}
                                aria-label={ic}
                                aria-pressed={editCat.icon === ic}
                              >
                                <CategoryIcon icon={ic} color={editCat.color} size={32} />
                              </button>
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Kolor">
                            {CATEGORY_COLORS.map((col) => (
                              <button
                                key={col}
                                onClick={() => setEditCat({ ...editCat, color: col })}
                                className={`h-7 w-7 rounded-full ${editCat.color.toUpperCase() === col ? "ring-2 ring-offset-2 ring-foreground" : ""}`}
                                style={{ backgroundColor: col }}
                                aria-label={col}
                                aria-pressed={editCat.color.toUpperCase() === col}
                              />
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={async () => {
                                const ok = await call("PATCH", { entity: "category", id: c.id, name: editCat.name, type: editCat.type, icon: editCat.icon, color: editCat.color });
                                if (ok) setEditCat(null);
                              }}
                              disabled={busy}
                              className={primaryCls}
                            >
                              Zapisz
                            </button>
                            <button onClick={() => setEditCat(null)} className={btnCls}>Anuluj</button>
                          </div>
                        </div>
                      )}

                      {mergePanel("category", c.id)}

                      {subs.length > 0 && (
                        <ul className="mt-3 divide-y divide-border border-t border-border">
                          {subs.map((s) => {
                            const km = KIND_META[s.kind ?? "none"];
                            const sGuard = deleteGuard({ transactions: s.txCount, trashed: s.trashCount, rules: s.ruleCount });
                            const sEditing = editSub?.id === s.id;
                            return (
                              <li key={s.id} className="py-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${km.chip}`} title={km.label}>
                                    {km.short}
                                  </span>
                                  <span className="min-w-0 flex-1 text-sm text-foreground">{s.name}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {s.txCount}{s.trashCount ? ` (+${s.trashCount})` : ""} tx{s.ruleCount ? ` · ${s.ruleCount} reg.` : ""}
                                  </span>
                                  {onlyNoKind ? (
                                    <select
                                      value=""
                                      onChange={(e) => e.target.value && call("PATCH", { entity: "subcategory", id: s.id, kind: e.target.value })}
                                      className={inputCls}
                                      aria-label={`Rodzaj: ${s.name}`}
                                    >
                                      <option value="">ustaw rodzaj…</option>
                                      <option value="fixed">Stałe</option>
                                      <option value="essential">Niezbędne</option>
                                      <option value="discretionary">Uznaniowe</option>
                                    </select>
                                  ) : (
                                    <div className="flex gap-1">
                                      <button onClick={() => setEditSub(sEditing ? null : { id: s.id, name: s.name, kind: s.kind, category_id: s.category_id })} className={btnCls}>Edytuj</button>
                                      <button onClick={() => setMerge({ entity: "subcategory", fromId: s.id, toId: "", summary: null })} className={btnCls}>Scal…</button>
                                      <button
                                        onClick={() => confirm(`Usunąć podkategorię „${s.name}”?`) && call("DELETE", undefined, `?entity=subcategory&id=${s.id}`)}
                                        disabled={busy || !sGuard.ok}
                                        title={sGuard.ok ? "Usuń podkategorię" : sGuard.reason}
                                        className={btnCls}
                                      >
                                        Usuń
                                      </button>
                                    </div>
                                  )}
                                </div>
                                {sEditing && editSub && (
                                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background p-2">
                                    <input value={editSub.name} onChange={(e) => setEditSub({ ...editSub, name: e.target.value })} className={`${inputCls} flex-1`} aria-label="Nazwa podkategorii" />
                                    <select value={editSub.kind ?? ""} onChange={(e) => setEditSub({ ...editSub, kind: (e.target.value || null) as Kind | null })} className={inputCls} aria-label="Rodzaj">
                                      <option value="">Bez rodzaju</option>
                                      <option value="fixed">Stałe</option>
                                      <option value="essential">Niezbędne</option>
                                      <option value="discretionary">Uznaniowe</option>
                                    </select>
                                    <select value={editSub.category_id} onChange={(e) => setEditSub({ ...editSub, category_id: e.target.value })} className={inputCls} aria-label="Kategoria">
                                      {cats.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                                    </select>
                                    <button
                                      onClick={async () => {
                                        const ok = await call("PATCH", { entity: "subcategory", id: s.id, name: editSub.name, kind: editSub.kind, category_id: editSub.category_id });
                                        if (ok) setEditSub(null);
                                      }}
                                      disabled={busy}
                                      className={primaryCls}
                                    >
                                      Zapisz
                                    </button>
                                    <button onClick={() => setEditSub(null)} className={btnCls}>Anuluj</button>
                                    {editSub.category_id !== s.category_id && (
                                      <p className="w-full text-[11px] text-amber-700">
                                        Przeniesienie: {s.txCount + s.trashCount} transakcji i {s.ruleCount} reguł zmieni kategorię, podkategoria zostaje.
                                      </p>
                                    )}
                                  </div>
                                )}
                                {mergePanel("subcategory", s.id)}
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      {!onlyNoKind && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <input
                            placeholder="Nowa podkategoria"
                            value={ns.name}
                            onChange={(e) => setNewSub({ ...newSub, [c.id]: { ...ns, name: e.target.value } })}
                            className={`${inputCls} flex-1`}
                          />
                          <select value={ns.kind} onChange={(e) => setNewSub({ ...newSub, [c.id]: { ...ns, kind: e.target.value as Kind | "" } })} className={inputCls} aria-label="Rodzaj nowej podkategorii">
                            <option value="">Bez rodzaju</option>
                            <option value="fixed">Stałe</option>
                            <option value="essential">Niezbędne</option>
                            <option value="discretionary">Uznaniowe</option>
                          </select>
                          <button
                            onClick={async () => {
                              const ok = await call("POST", { action: "create", entity: "subcategory", categoryId: c.id, name: ns.name, kind: ns.kind || null });
                              if (ok) setNewSub({ ...newSub, [c.id]: { name: "", kind: "" } });
                            }}
                            disabled={busy || !ns.name.trim()}
                            className={btnCls}
                          >
                            Dodaj
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        {tree && !onlyNoKind && (
          <section className="mt-8 rounded-2xl border border-dashed border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-foreground">Nowa kategoria</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <input placeholder="Nazwa" value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} className={`${inputCls} flex-1`} />
              <select value={newCat.type} onChange={(e) => setNewCat({ ...newCat, type: e.target.value as CategoryType })} className={inputCls} aria-label="Typ nowej kategorii">
                {GROUPS.map((x) => <option key={x.type} value={x.type}>{TYPE_LABEL[x.type]}</option>)}
              </select>
              <button
                onClick={async () => {
                  const ok = await call("POST", { action: "create", entity: "category", name: newCat.name, type: newCat.type });
                  if (ok) setNewCat({ name: "", type: newCat.type });
                }}
                disabled={busy || !newCat.name.trim()}
                className={primaryCls}
              >
                Dodaj kategorię
              </button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">Ikonę i kolor ustawisz potem przez „Edytuj”.</p>
          </section>
        )}
        {allSubs.length === 0 && tree && <p className="mt-6 text-sm text-muted-foreground">Brak podkategorii.</p>}
      </div>
    </div>
  );
}
