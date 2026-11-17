"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { BackButton } from "@/components/dashboard/back-button";
import { CategoryIcon } from "@/components/finanse/CategoryIcon";
import { FinanseNav } from "@/components/finanse/FinanseNav";
import {
  PRESETS,
  presetRange,
  loadPeriod,
  savePeriod,
  periodTitle,
  monthsInRange,
  monthLabel,
  formatZl,
  type Period,
  type Preset,
} from "@/lib/finanse-period";

// Dashboard Finansów — scoreboard 4DX dla wydatków prywatnych.
// Liczby z /api/finanse/dashboard (jedna definicja „wydatków”: finanse-summary.ts).

type Merchant = { name: string; amount: number; count: number };
type SubAmount = { id: string | null; name: string; kind: "fixed" | "essential" | "discretionary" | null; amount: number; count: number };
type Cat = {
  id: string | null;
  name: string;
  amount: number;
  share: number;
  count: number;
  icon: string | null;
  color: string | null;
  topMerchants: Merchant[];
  subcategories: SubAmount[];
};
type Dash = {
  from: string;
  to: string;
  today: string;
  total: number;
  income: number;
  savingsNet: number;
  categories: Cat[];
  netNegativeCategories: { id: string | null; name: string; amount: number }[];
  expensesInIncomeCats: { amount: number; count: number };
  monthsWithData: string[];
  kinds: { fixed: number; essential: number; discretionary: number; unassigned: number };
  oneOff: number;
  recurring: number;
  last7: { date: string; amount: number }[];
  weekDiscretionary: number;
  weekStart: string;
  unreviewedInPeriod: number;
  unreviewedTotal: number;
  lastReviewedAt: string | null;
  lastTransactionDate: string | null;
};

type WigStatus = {
  status: {
    spent: number;
    spentRecurring: number;
    plannedRemaining: number;
    runRest: number;
    dailyRate: number;
    forecast: number;
    limit: number;
    overBy: number;
    perDayLeft: number;
    daysLeft: number;
    preliminary: boolean;
  };
  big: { id: string }[];
  lastCompletedAt: string | null;
  goal: { status: "pending" | "approved"; monthly_limit: number };
};

const STORAGE_KEY = "finanse_dashboard_period";
const YIELD = 0.04; // założenie modelowe z Wizji 2029 (kalkulator kapitału), nie gwarantowana stopa
const DOW = ["nd", "pn", "wt", "śr", "czw", "pt", "sob"];
const KIND_META = {
  fixed: { label: "Stałe", short: "S", bar: "#9AA6B2", chip: "bg-slate-100 text-slate-700" },
  essential: { label: "Niezbędne", short: "N", bar: "#B7CCBD", chip: "bg-emerald-50 text-emerald-800" },
  discretionary: { label: "Uznaniowe", short: "U", bar: "#F0C99A", chip: "bg-amber-50 text-amber-800" },
  unassigned: { label: "Bez rodzaju", short: "?", bar: "#E2DFDB", chip: "bg-muted text-muted-foreground" },
} as const;

const shortDate = (s: string) => `${Number(s.slice(8, 10))}.${s.slice(5, 7)}`;
const pct = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;

export default function FinanseDashboardPage() {
  const [period, setPeriod] = useState<Period | null>(null);
  const [data, setData] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  // Drill-down under a row of the open category: "s:<subId>" / "p:<payee>" / "n:<catId>" (net-negative category)
  const [drill, setDrill] = useState<string | null>(null);
  useEffect(() => setDrill(null), [open, data]);
  // WIG bar: always the current month (independent of the chosen period) — /api/finanse/coach/status
  const [wig, setWig] = useState<WigStatus | null>(null);
  const loadWig = () =>
    fetch("/api/finanse/coach/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setWig(d))
      .catch(() => {});
  useEffect(() => {
    loadWig();
  }, []);
  // "Zmień limit": a small inline form here (review step 4 links to /finanse/dashboard?limit=edit).
  const [limitOpen, setLimitOpen] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("limit") === "edit") setLimitOpen(true);
  }, []);

  useEffect(() => {
    setPeriod(loadPeriod(STORAGE_KEY));
  }, []);

  useEffect(() => {
    if (!period || period.from > period.to) return;
    savePeriod(STORAGE_KEY, period);
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch(`/api/finanse/dashboard?from=${period.from}&to=${period.to}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Dash) => !cancelled && setData(d))
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [period]);

  function choose(preset: Preset) {
    setOpen(null);
    if (preset === "custom") setPeriod((p) => ({ preset, from: p?.from ?? presetRange("month").from, to: p?.to ?? presetRange("month").to }));
    else setPeriod({ preset, ...presetRange(preset) });
  }

  const cats = data?.categories ?? [];
  const max = cats[0]?.amount ?? 0;
  const openCat = cats.find((c) => (c.id ?? "__none__") === open) ?? null;
  const kindTotal = data ? data.kinds.fixed + data.kinds.essential + data.kinds.discretionary + data.kinds.unassigned : 0;
  const maxDay = Math.max(1, ...(data?.last7 ?? []).map((d) => d.amount));

  const gapNote = (() => {
    if (!data || data.monthsWithData.length === 0) return null;
    const lastMonth = data.today.slice(0, 7);
    const missing = monthsInRange(data.from, data.to).filter((m) => m <= lastMonth && !data.monthsWithData.includes(m));
    if (missing.length === 0) return null;
    return `Dane z: ${data.monthsWithData.map(monthLabel).join(", ")} — brak importu za pozostałe miesiące`;
  })();

  // "Liczba wolności": capital that pays the period's monthly cost of living at YIELD.
  const freedom = (() => {
    if (!data || !period || (period.preset !== "month" && period.preset !== "prev")) return null;
    return (data.recurring * 12) / YIELD;
  })();

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <BackButton />
        <FinanseNav active="dashboard" />

        {/* Header */}
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Wizja 2029 · Finanse prywatne</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">{period ? periodTitle(period) : "Finanse"}</h1>
            {data && (
              <p className="mt-1 text-sm text-muted-foreground">
                {data.lastTransactionDate ? `Dane do ${shortDate(data.lastTransactionDate)}` : "Brak danych"} ·{" "}
                <Link href="/finanse/przeglad" className="font-medium text-emerald-700 hover:underline">
                  {data.unreviewedTotal} do przeglądu
                </Link>{" "}
                ·{" "}
                <Link href="/finanse" className="hover:underline">
                  Import i historia
                </Link> ·{" "}
                <Link href="/finanse/kategorie" className="hover:underline">
                  Kategorie →
                </Link>
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => choose(p.id)}
                className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                  period?.preset === p.id
                    ? "border-emerald-700 bg-emerald-700 font-semibold text-white"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {period?.preset === "custom" && (
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2 text-sm">
            <input
              type="date"
              aria-label="Od"
              value={period.from}
              max={period.to}
              onChange={(e) => e.target.value && setPeriod({ ...period, from: e.target.value })}
              className="rounded-lg border border-border bg-card px-2 py-1.5"
            />
            <span className="text-muted-foreground">–</span>
            <input
              type="date"
              aria-label="Do"
              value={period.to}
              min={period.from}
              onChange={(e) => e.target.value && setPeriod({ ...period, to: e.target.value })}
              className="rounded-lg border border-border bg-card px-2 py-1.5"
            />
          </div>
        )}

        {error && <p className="mt-6 text-sm text-red-600">Nie udało się pobrać danych. Odśwież stronę.</p>}

        {/* WIG scoreboard */}
        <section aria-label="WIG wydatków" className="mt-6 grid gap-6 rounded-3xl bg-[#1F3A2C] p-6 text-[#F4F1EC] sm:p-7 md:grid-cols-3">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-bold uppercase tracking-widest text-[#A9C9B5]">
              Koszty życia · ten miesiąc
              {wig && (
                <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] normal-case tracking-normal ${wig.goal.status === "approved" ? "bg-[#8FD1A8] text-[#1F3A2C]" : "bg-[#F0C99A] text-[#1F3A2C]"}`}>
                  limit {wig.goal.status === "approved" ? "zatwierdzony" : "do zatwierdzenia"}
                </span>
              )}
            </p>
            {wig ? (
              <>
                <p className="font-mono text-3xl font-bold">
                  {formatZl(wig.status.spent)}
                  <span className="text-base font-normal text-[#C9D8CE]">
                    {" "}/ {formatZl(wig.status.limit)}{wig.goal.status === "approved" ? "" : " (roboczy)"}
                  </span>
                </p>
                <div className="h-2.5 overflow-hidden rounded-full bg-[#3B5A48]" aria-hidden="true">
                  <div
                    className={`h-full ${
                      wig.status.spent > wig.status.limit ? "bg-red-500" : wig.status.spent >= 0.8 * wig.status.limit ? "bg-amber-400" : "bg-[#8FD1A8]"
                    }`}
                    style={{ width: `${Math.min(100, (wig.status.spent / wig.status.limit) * 100)}%` }}
                  />
                </div>
                <p className="text-sm text-[#C9D8CE]">
                  Wydane {formatZl(wig.status.spent)} · bieżące do końca miesiąca ~{formatZl(wig.status.runRest)} ({formatZl(wig.status.dailyRate)}/dzień ×{" "}
                  {wig.status.daysLeft} dni) · planowane {formatZl(wig.status.plannedRemaining)}
                </p>
                <p className={`text-sm font-semibold ${wig.status.overBy > 0 ? "text-red-300" : "text-[#8FD1A8]"}`}>
                  Prognoza {formatZl(wig.status.forecast)}
                  {wig.status.preliminary ? " (wstępna)" : ""}
                  {wig.status.overBy > 0
                    ? wig.goal.status === "approved"
                      ? ` · przekroczysz o ${formatZl(wig.status.overBy)}`
                      : ` · ${formatZl(wig.status.overBy)} powyżej limitu roboczego`
                    : ""}
                </p>
                <p className="text-xs">
                  <button type="button" onClick={() => setLimitOpen((o) => !o)} aria-expanded={limitOpen} className="text-[#A9C9B5] underline hover:text-[#F4F1EC]">
                    {wig.goal.status === "approved" ? "Zmień limit" : "Ustal i zatwierdź limit"}
                  </button>
                </p>
                {limitOpen && (
                  <LimitForm
                    goal={wig.goal}
                    onDone={() => {
                      setLimitOpen(false);
                      loadWig();
                    }}
                  />
                )}
                {wig.big.length > 0 && (
                  <Link
                    href="/finanse/przeglad?step=2"
                    className="mt-1 w-fit rounded-xl bg-[#F0C99A] px-4 py-2 text-sm font-semibold text-[#1F3A2C] hover:bg-[#f5d6ae]"
                  >
                    Omów {wig.big.length} {wig.big.length === 1 ? "duży wydatek" : "dużych wydatków"}
                  </Link>
                )}
              </>
            ) : (
              <p className="font-mono text-3xl font-bold">—</p>
            )}
          </div>
          <div className="flex flex-col gap-2 md:border-l md:border-[#3B5A48] md:pl-6">
            <p className="text-xs font-bold uppercase tracking-widest text-[#A9C9B5]">Lead 1 · przegląd tygodniowy</p>
            <p className="font-mono text-3xl font-bold">{data ? data.unreviewedTotal : "—"}</p>
            <p className="text-sm text-[#C9D8CE]">
              transakcji czeka na przegląd
              {(() => {
                // Last review = the later of: last confirmed transaction, last completed weekly review.
                const last = [data?.lastReviewedAt, wig?.lastCompletedAt].filter(Boolean).sort().pop();
                return last ? ` · ostatni ${shortDate(last.slice(0, 10))}` : "";
              })()}
            </p>
            <Link href="/finanse/przeglad" className="mt-1 w-fit rounded-xl bg-[#8FD1A8] px-4 py-2 text-sm font-semibold text-[#1F3A2C] hover:bg-[#a6dcbb]">
              Zrób przegląd
            </Link>
          </div>
          <div className="flex flex-col gap-2 md:border-l md:border-[#3B5A48] md:pl-6">
            <p className="text-xs font-bold uppercase tracking-widest text-[#A9C9B5]">Lead 2 · uznaniowe w tym tygodniu</p>
            <p className="font-mono text-3xl font-bold">{data ? formatZl(data.weekDiscretionary) : "—"}</p>
            <p className="text-sm text-[#C9D8CE]">
              od {data ? shortDate(data.weekStart) : "pn"} ·{" "}
              {wig
                ? wig.status.overBy > 0
                  ? wig.goal.status === "approved"
                    ? "limit miesiąca już przekroczony"
                    : "ponad limit roboczy (do zatwierdzenia)"
                  : `zostało ${formatZl(wig.status.perDayLeft)} dziennie do limitu${wig.goal.status === "approved" ? "" : " roboczego"}`
                : "—"}
            </p>
          </div>
        </section>

        {/* KPI tiles */}
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Koszty życia" value={data ? formatZl(data.total) : "—"} note={data ? `netto po zwrotach · w tym jednorazowe ${formatZl(data.oneOff)}` : ""} />
          <Tile label="Odłożone na cele" value={data ? formatZl(data.savingsNet) : "—"} note="przelewy własne netto" valueClass="text-blue-700" />
          <Tile label="Przychody na konto" value={data ? formatZl(data.income) : "—"} note="plantacja, najem, spółka" valueClass="text-emerald-700" />
          <Tile
            label="Liczba wolności"
            value={freedom !== null ? formatZl(freedom) : "—"}
            note={freedom !== null ? "koszty bez jednorazowych × 12 ÷ 4% · −1 000 zł/mies. = −300 tys. zł" : "wybierz pełny miesiąc"}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-start gap-4">
          {/* Categories */}
          <section aria-label="Kategorie" className="min-w-0 flex-[999_1_620px] rounded-3xl border border-border bg-card p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-bold text-foreground">Na co idą pieniądze</h2>
              <p className="text-sm text-muted-foreground">kliknij kategorię → podkategorie i odbiorcy</p>
            </div>

            {loading && !data ? (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />
                ))}
              </div>
            ) : cats.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">Brak wydatków w tym okresie.</p>
            ) : (
              <div className={`mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 ${loading ? "opacity-60" : ""}`}>
                {cats.map((c) => {
                  const key = c.id ?? "__none__";
                  const isOpen = open === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setOpen(isOpen ? null : key)}
                      aria-expanded={isOpen}
                      className={`flex flex-col gap-2.5 rounded-2xl border p-4 text-left transition-colors ${
                        isOpen ? "border-emerald-600 bg-emerald-50/40" : "border-border hover:border-stone-300"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <CategoryIcon icon={c.icon} color={c.id ? c.color : "#9CA3AF"} />
                        <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{c.name}</span>
                        <span className="text-xs text-muted-foreground">{pct(c.share)}</span>
                      </div>
                      <span className="font-mono text-xl font-bold tabular-nums text-foreground">{formatZl(c.amount)}</span>
                      <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${max > 0 ? Math.max(1, (c.amount / max) * 100) : 0}%`, backgroundColor: c.color || "#9CA3AF" }}
                        />
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {openCat && (
              <div className="mt-4 grid gap-6 rounded-2xl border border-border bg-background p-4 sm:grid-cols-2">
                <div>
                  <h3 className="text-sm font-bold text-foreground">{openCat.name} · podkategorie</h3>
                  <ul className="mt-2 divide-y divide-border">
                    {openCat.subcategories.map((s) => {
                      const k = `s:${s.id ?? "__none__"}`;
                      const isDrill = drill === k;
                      return (
                        <li key={s.id ?? "__none__"} className="py-1">
                          <button
                            type="button"
                            onClick={() => setDrill(isDrill ? null : k)}
                            aria-expanded={isDrill}
                            className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-1 text-left text-sm hover:bg-muted/50"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold ${KIND_META[s.kind ?? "unassigned"].chip}`} title={KIND_META[s.kind ?? "unassigned"].label}>
                                {KIND_META[s.kind ?? "unassigned"].short}
                              </span>
                              <span className="truncate">{s.name}</span>
                            </span>
                            <span className="whitespace-nowrap font-mono tabular-nums">
                              {formatZl(s.amount)} <span className="text-muted-foreground">· {s.count}× {isDrill ? "▴" : "▾"}</span>
                            </span>
                          </button>
                          {isDrill && data && (
                            <DrillList from={data.from} to={data.to} categoryId={openCat.id ?? "__none__"} subcategoryId={s.id ?? "__none__"} />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">Najwięcej u</h3>
                  <ul className="mt-2 divide-y divide-border">
                    {openCat.topMerchants.map((m) => {
                      const k = `p:${m.name}`;
                      const isDrill = drill === k;
                      return (
                        <li key={m.name} className="py-1">
                          <button
                            type="button"
                            onClick={() => setDrill(isDrill ? null : k)}
                            aria-expanded={isDrill}
                            className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-1 text-left text-sm hover:bg-muted/50"
                          >
                            <span className="min-w-0 truncate text-muted-foreground">{m.name}</span>
                            <span className="whitespace-nowrap font-mono tabular-nums">
                              {formatZl(m.amount)} <span className="text-muted-foreground">· {m.count}× {isDrill ? "▴" : "▾"}</span>
                            </span>
                          </button>
                          {isDrill && data && <DrillList from={data.from} to={data.to} categoryId={openCat.id ?? "__none__"} payee={m.name} />}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            )}

            {/* Kind split */}
            {data && kindTotal > 0 && (
              <div className="mt-5 border-t border-border pt-4">
                <p className="text-sm font-semibold text-foreground">Stałe · Niezbędne · Uznaniowe</p>
                <div className="mt-2 flex h-3.5 overflow-hidden rounded-full bg-muted" role="img" aria-label="Podział wydatków według rodzaju">
                  {(["fixed", "essential", "discretionary", "unassigned"] as const).map((k) =>
                    data.kinds[k] > 0 ? (
                      <span key={k} style={{ width: `${(data.kinds[k] / kindTotal) * 100}%`, backgroundColor: KIND_META[k].bar }} />
                    ) : null
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                  {(["fixed", "essential", "discretionary", "unassigned"] as const).map((k) =>
                    data.kinds[k] !== 0 ? (
                      <span key={k} className="flex items-center gap-1.5">
                        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: KIND_META[k].bar }} />
                        {KIND_META[k].label} <span className="font-mono tabular-nums text-foreground">{formatZl(data.kinds[k])}</span>
                      </span>
                    ) : null
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Uznaniowe to dźwignia codziennej kontroli. Stałe przeglądaj raz na kwartał.</p>
              </div>
            )}

            {data && (data.netNegativeCategories.length > 0 || gapNote) && (
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                {data.netNegativeCategories.length > 0 && (
                  <div>
                    <p>
                      Zwroty przewyższające wydatki:{" "}
                      {data.netNegativeCategories.map((c, i) => {
                        const k = `n:${c.id ?? "__none__"}`;
                        return (
                          <React.Fragment key={k}>
                            {i > 0 && ", "}
                            <button
                              type="button"
                              onClick={() => setDrill(drill === k ? null : k)}
                              aria-expanded={drill === k}
                              className="underline decoration-dotted underline-offset-2 hover:text-foreground"
                            >
                              {c.name} +{formatZl(c.amount)}
                            </button>
                          </React.Fragment>
                        );
                      })}
                    </p>
                    {data.netNegativeCategories.map((c) =>
                      drill === `n:${c.id ?? "__none__"}` ? (
                        <DrillList key={c.id ?? "__none__"} from={data.from} to={data.to} categoryId={c.id ?? "__none__"} />
                      ) : null
                    )}
                  </div>
                )}
                {gapNote && <p>{gapNote}</p>}
              </div>
            )}
          </section>

          {/* Side column */}
          <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
            <section aria-label="Ostatnie 7 dni" className="rounded-3xl border border-border bg-card p-5 sm:p-6">
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-bold text-foreground">Ostatnie 7 dni</h2>
                <span className="text-xs text-muted-foreground">wszystkie wydatki</span>
              </div>
              {data && (
                <>
                  <div
                    className="mt-4 grid h-36 grid-cols-7 items-end gap-2"
                    role="img"
                    aria-label={`Wydatki dzienne: ${data.last7.map((d) => `${shortDate(d.date)} ${Math.round(d.amount)} zł`).join(", ")}`}
                  >
                    {data.last7.map((d, i) => (
                      <div key={d.date} className="flex h-full flex-col justify-end" title={`${shortDate(d.date)}: ${formatZl(d.amount)}`}>
                        <div
                          className="rounded-t-md"
                          style={{
                            height: d.amount > 0 ? `${Math.max(3, (d.amount / maxDay) * 100)}%` : "2px",
                            backgroundColor: d.amount > 0 ? (i === 6 ? "#2F7D55" : "#9CCFB0") : "#DDD9D4",
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 grid grid-cols-7 gap-2 text-center text-xs text-muted-foreground">
                    {data.last7.map((d, i) => (
                      <span key={d.date} className={i === 6 ? "font-bold text-foreground" : ""}>
                        {DOW[new Date(`${d.date}T12:00:00Z`).getUTCDay()]}
                      </span>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Dni bez danych to zwykle brak importu, nie brak wydatków. Import robisz w sesji WIG.
                  </p>
                </>
              )}
            </section>

            <section aria-label="Do decyzji" className="rounded-3xl border border-border bg-card p-5 sm:p-6">
              <h2 className="text-lg font-bold text-foreground">Do decyzji</h2>
              {data && (
                <div className="mt-3 flex flex-col gap-2">
                  <Decision href="/finanse/przeglad" n={data.unreviewedTotal} text="transakcji czeka na przegląd" warn={data.unreviewedTotal > 0} />
                  {/* One definition with review step 2: big expenses (≥ 1 000 zł, this month) without a decision. */}
                  {wig &&
                    (wig.big.length > 0 ? (
                      <Decision href="/finanse/przeglad?step=2" n={wig.big.length} text="dużych wydatków do omówienia" warn />
                    ) : (
                      <p className="flex items-center gap-3 rounded-xl bg-muted p-3 text-sm text-muted-foreground">Duże wydatki omówione ✓</p>
                    ))}
                  {data.expensesInIncomeCats.amount > 0 && (
                    <Decision href="/finanse" n={Math.round(data.expensesInIncomeCats.amount)} text={`zł wydatków w kategoriach przychodowych (${data.expensesInIncomeCats.count})`} warn />
                  )}
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, note, valueClass = "text-foreground" }: { label: string; value: string; note: string; valueClass?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className={`font-mono text-2xl font-bold tabular-nums ${valueClass}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

// Changing the limit: an approved limit needs an explicit inline confirmation (no window.confirm); the change
// is saved as approved and logged in finance_goal_history by PATCH /api/finanse/coach/goal.
function LimitForm({ goal, onDone }: { goal: WigStatus["goal"]; onDone: () => void }) {
  const [value, setValue] = useState(String(goal.monthly_limit));
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
  const valid = Number.isFinite(parsed) && parsed > 0;
  const approved = goal.status === "approved";
  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/finanse/coach/goal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthlyLimit: parsed, status: "approved" }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setMsg(d.error || "Nie zapisano");
      else onDone();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-1 rounded-xl bg-[#2A4A39] p-3 text-sm">
      <label className="flex flex-wrap items-center gap-2">
        <span className="text-[#C9D8CE]">Limit kosztów życia / mies.</span>
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setConfirming(false);
          }}
          inputMode="decimal"
          aria-label="Limit miesięczny w zł"
          className="w-32 rounded-lg border border-[#3B5A48] bg-[#1F3A2C] px-2 py-1.5 font-mono text-[#F4F1EC]"
        />
      </label>
      {!confirming ? (
        <button
          type="button"
          onClick={() => (approved ? setConfirming(true) : save())}
          disabled={busy || !valid || (approved && parsed === goal.monthly_limit)}
          className="mt-2 rounded-lg bg-[#8FD1A8] px-3 py-1.5 text-xs font-semibold text-[#1F3A2C] disabled:opacity-40"
        >
          {approved ? "Zmień" : `Zatwierdzam ${valid ? formatZl(parsed) : ""}`}
        </button>
      ) : (
        <div className="mt-2">
          <p className="text-[#F4F1EC]">
            Zmieniasz zatwierdzony limit z {formatZl(goal.monthly_limit)} na {formatZl(parsed)}. Potwierdź.
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={save} disabled={busy} className="rounded-lg bg-[#F0C99A] px-3 py-1.5 text-xs font-semibold text-[#1F3A2C] disabled:opacity-40">
              Potwierdzam zmianę
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="rounded-lg border border-[#3B5A48] px-3 py-1.5 text-xs text-[#C9D8CE]">
              Anuluj
            </button>
          </div>
        </div>
      )}
      {msg && <p className="mt-1 text-xs text-red-300">{msg}</p>}
    </div>
  );
}

function Decision({ href, n, text, warn }: { href: string; n: number; text: string; warn: boolean }) {
  return (
    <Link href={href} className={`flex items-center gap-3 rounded-xl p-3 text-sm hover:opacity-90 ${warn ? "bg-amber-50" : "bg-muted"}`}>
      <span className={`min-w-[2.5rem] font-mono text-lg font-bold tabular-nums ${warn ? "text-amber-800" : "text-muted-foreground"}`}>{n}</span>
      <span className="leading-snug text-foreground">{text}</span>
    </Link>
  );
}

// Transactions behind one dashboard row (GET /api/finanse/dashboard/transactions). The total comes from the
// same function as the row's amount, so "Razem" always equals it. A row opens the transaction in Historia.
type DrillTx = { id: string; date: string; amount: number; payee: string; title: string; one_off: boolean };
/** "1 234,56 zł" — with grosze (formatZl rounds to whole złoty; the list must add up to the grosz). */
const zlGr = (v: number) => {
  const gr = Math.round(Math.abs(v) * 100);
  return `${v < 0 ? "−" : ""}${String(Math.floor(gr / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${String(gr % 100).padStart(2, "0")} zł`;
};

function DrillList({ from, to, categoryId, subcategoryId, payee }: { from: string; to: string; categoryId: string; subcategoryId?: string; payee?: string }) {
  const [res, setRes] = useState<{ total: number; transactions: DrillTx[] } | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams({ from, to, categoryId });
    if (subcategoryId) q.set("subcategoryId", subcategoryId);
    if (payee) q.set("payee", payee);
    let alive = true;
    fetch(`/api/finanse/dashboard/transactions?${q}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => alive && setRes(d))
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, [from, to, categoryId, subcategoryId, payee]);

  if (err) return <p className="mt-1 rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-700">Nie udało się pobrać transakcji.</p>;
  if (!res) return <p className="mt-1 px-2 py-1.5 text-xs text-muted-foreground">Ładowanie…</p>;
  return (
    <div className="mt-1 w-full rounded-xl border border-border bg-card">
      <ul className="divide-y divide-border">
        {res.transactions.map((t) => (
          <li key={t.id}>
            <Link
              href={`/finanse?tab=historia&month=${t.date.slice(0, 7)}&highlight=${t.id}`}
              className="flex items-start justify-between gap-3 px-3 py-2 text-xs hover:bg-muted/40"
            >
              <span className="min-w-0">
                <span className="text-muted-foreground">{shortDate(t.date)}</span> · <span className="font-medium text-foreground">{t.payee}</span>
                {t.one_off && <span className="ml-1.5 rounded bg-slate-100 px-1 py-0.5 text-[10px] font-semibold text-slate-700">jednorazowy</span>}
                {t.amount > 0 && <span className="ml-1.5 rounded bg-emerald-50 px-1 py-0.5 text-[10px] font-semibold text-emerald-800">zwrot</span>}
                {t.title && t.title !== t.payee && <span className="block truncate text-muted-foreground">{t.title}</span>}
              </span>
              <span className={`whitespace-nowrap font-mono tabular-nums ${t.amount > 0 ? "text-emerald-700" : "text-foreground"}`}>
                {t.amount > 0 ? "+" : ""}
                {zlGr(t.amount)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="flex justify-between border-t border-border px-3 py-2 text-xs font-semibold text-foreground">
        <span>Razem ({res.transactions.length})</span>
        <span className="font-mono tabular-nums">{zlGr(res.total)}</span>
      </p>
    </div>
  );
}
