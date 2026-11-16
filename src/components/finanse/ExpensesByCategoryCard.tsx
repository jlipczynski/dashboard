"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Home page card: expenses by category for a chosen period.
// A separate card — not part of any pillar score.

type Merchant = { name: string; amount: number; count: number };
type Category = { id: string | null; name: string; amount: number; share: number; count: number; topMerchants: Merchant[] };
type Summary = {
  from: string;
  to: string;
  total: number;
  categories: Category[];
  savingsNet: number;
  netNegativeCategories?: { id: string | null; name: string; amount: number }[];
  expensesInIncomeCats: { amount: number; count: number };
  monthsWithData: string[];
};

type Preset = "month" | "prev" | "3m" | "ytd" | "custom";
type Period = { preset: Preset; from: string; to: string };

const PRESETS: { id: Preset; label: string }[] = [
  { id: "month", label: "Ten miesiąc" },
  { id: "prev", label: "Poprzedni" },
  { id: "3m", label: "3 mies." },
  { id: "ytd", label: "Od początku roku" },
  { id: "custom", label: "Własny" },
];
const STORAGE_KEY = "finanse_summary_period";
const MAX_BARS = 8; // more categories → top 7 + "Pozostałe (n)"
const MONTHS_SHORT = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthEnd = (y: number, m: number) => new Date(y, m + 1, 0); // m: 0-based

/** Months (YYYY-MM) covered by from..to, inclusive. */
function monthsInRange(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const ty = Number(to.slice(0, 4));
  const tm = Number(to.slice(5, 7));
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${pad(m)}`);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

function presetRange(preset: Exclude<Preset, "custom">, now = new Date()): { from: string; to: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case "month":
      return { from: iso(new Date(y, m, 1)), to: iso(monthEnd(y, m)) };
    case "prev":
      return { from: iso(new Date(y, m - 1, 1)), to: iso(monthEnd(y, m - 1)) };
    case "3m":
      return { from: iso(new Date(y, m - 2, 1)), to: iso(monthEnd(y, m)) };
    case "ytd":
      return { from: `${y}-01-01`, to: iso(now) };
  }
}

function loadPeriod(): Period {
  try {
    const p = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as Period | null;
    if (p?.preset === "custom" && p.from && p.to) return p;
    if (p?.preset && p.preset !== "custom") return { preset: p.preset, ...presetRange(p.preset) };
  } catch {}
  return { preset: "month", ...presetRange("month") };
}

// Whole złoty with a thin space every 3 digits ("5 250 zł" — Intl pl-PL leaves 4-digit numbers ungrouped).
const formatZl = (v: number) => `${String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0")} zł`;
const monthLabel = (ym: string) => `${MONTHS_SHORT[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

export function ExpensesByCategoryCard() {
  const [period, setPeriod] = useState<Period | null>(null);
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showRest, setShowRest] = useState(false);

  // Read the saved period after mount (localStorage is not available during SSR)
  useEffect(() => {
    setPeriod(loadPeriod());
  }, []);

  useEffect(() => {
    if (!period || period.from > period.to) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(period));
    } catch {}
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch(`/api/finanse/summary?from=${period.from}&to=${period.to}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Summary) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  function choose(preset: Preset) {
    setExpanded(null);
    setShowRest(false);
    if (preset === "custom") setPeriod((p) => ({ preset, from: p?.from ?? presetRange("month").from, to: p?.to ?? presetRange("month").to }));
    else setPeriod({ preset, ...presetRange(preset) });
  }

  const cats = data?.categories ?? [];
  const top = cats.length > MAX_BARS ? cats.slice(0, MAX_BARS - 1) : cats;
  const rest = cats.length > MAX_BARS ? cats.slice(MAX_BARS - 1) : [];
  const restAmount = rest.reduce((s, c) => s + c.amount, 0);
  const restShare = rest.reduce((s, c) => s + c.share, 0);
  const max = cats[0]?.amount ?? 0;

  // Months in the period (up to today) that have no transactions at all → import gap
  const today = new Date();
  const gapNote = (() => {
    if (!data || data.monthsWithData.length === 0) return null;
    const lastMonth = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`;
    const covered = monthsInRange(data.from, data.to).filter((m) => m <= lastMonth);
    const missing = covered.filter((m) => !data.monthsWithData.includes(m));
    if (missing.length === 0) return null;
    return `Dane z: ${data.monthsWithData.map(monthLabel).join(", ")} — brak importu za pozostałe miesiące`;
  })();

  const bar = (c: Category | { id: string; name: string; amount: number; share: number }, key: string, onClick: () => void, open: boolean, label?: string) => (
    <button key={key} onClick={onClick} className="grid w-full grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-2 py-1 text-left sm:grid-cols-[minmax(0,10rem)_1fr_auto] sm:gap-3" aria-expanded={open}>
      <span className="truncate text-xs text-foreground">{label ?? c.name}</span>
      <span className="h-2 overflow-hidden rounded-full bg-muted">
        <span
          className={`block h-full rounded-full ${c.id === null ? "bg-gray-400" : "bg-emerald-500"}`}
          style={{ width: `${max > 0 ? Math.max(1, (c.amount / max) * 100) : 0}%` }}
        />
      </span>
      <span className="whitespace-nowrap text-right font-mono text-xs tabular-nums text-foreground">
        {formatZl(c.amount)} <span className="text-muted-foreground">· {c.share.toFixed(1).replace(".", ",")}%</span>
      </span>
    </button>
  );

  const merchants = (c: Category) =>
    expanded === (c.id ?? "__none__") && (
      <div className="mb-2 ml-2 border-l border-border pl-3">
        {c.topMerchants.map((m) => (
          <div key={m.name} className="flex items-center justify-between gap-3 py-0.5 text-[11px]">
            <span className="min-w-0 truncate text-muted-foreground">{m.name}</span>
            <span className="whitespace-nowrap font-mono tabular-nums text-foreground">
              {formatZl(m.amount)} <span className="text-muted-foreground">· {m.count}×</span>
            </span>
          </div>
        ))}
      </div>
    );

  const catRow = (c: Category) => {
    const key = c.id ?? "__none__";
    return (
      <div key={key}>
        {bar(c, key, () => setExpanded((e) => (e === key ? null : key)), expanded === key)}
        {merchants(c)}
      </div>
    );
  };

  return (
    <section className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-foreground">💸 Wydatki wg kategorii</h2>
        {data && !loading && !error && (
          <span className="font-mono text-lg font-bold tabular-nums text-foreground">{formatZl(data.total)}</span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => choose(p.id)}
            className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
              period?.preset === p.id
                ? "border-emerald-600 bg-emerald-600 font-medium text-white"
                : "border-border bg-background text-muted-foreground hover:text-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {period?.preset === "custom" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <input
            type="date"
            value={period.from}
            max={period.to}
            onChange={(e) => e.target.value && setPeriod({ ...period, from: e.target.value })}
            className="rounded-lg border border-border bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <span className="text-muted-foreground">–</span>
          <input
            type="date"
            value={period.to}
            min={period.from}
            onChange={(e) => e.target.value && setPeriod({ ...period, to: e.target.value })}
            className="rounded-lg border border-border bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      )}

      <div className="mt-4">
        {loading || !period ? (
          <div className="space-y-2" aria-label="Ładowanie">
            {[100, 75, 55, 40, 25].map((w) => (
              <div key={w} className="h-3 animate-pulse rounded-full bg-muted" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : error ? (
          <p className="text-xs text-red-600">Nie udało się pobrać wydatków. Spróbuj odświeżyć stronę.</p>
        ) : cats.length === 0 ? (
          <p className="text-xs text-muted-foreground">Brak wydatków w tym okresie.</p>
        ) : (
          <div>
            {top.map(catRow)}
            {rest.length > 0 && (
              <>
                {bar(
                  { id: "__rest__", name: "Pozostałe", amount: restAmount, share: restShare },
                  "__rest__",
                  () => setShowRest((v) => !v),
                  showRest,
                  `Pozostałe (${rest.length}) ${showRest ? "▴" : "▾"}`
                )}
                {showRest && <div className="ml-2 border-l border-border pl-3">{rest.map(catRow)}</div>}
              </>
            )}
          </div>
        )}
      </div>

      {data && !loading && !error && (
        <div className="mt-3 space-y-1 text-[11px]">
          {data.savingsNet > 0 && (
            <p className="text-muted-foreground">
              Na cele / przelewy własne (netto): <span className="font-mono tabular-nums text-foreground">{formatZl(data.savingsNet)}</span>
            </p>
          )}
          {(data.netNegativeCategories ?? []).length > 0 && (
            <p className="text-muted-foreground">
              Zwroty przewyższające wydatki:{" "}
              {(data.netNegativeCategories ?? []).map((c, i) => (
                <span key={c.id ?? "__none__"}>
                  {i > 0 && ", "}
                  {c.name} <span className="font-mono tabular-nums text-emerald-700">+{formatZl(c.amount)}</span>
                </span>
              ))}
            </p>
          )}
          {data.expensesInIncomeCats.amount > 0 && (
            <Link href="/finanse" className="block text-amber-700 hover:underline">
              ⚠ Wydatki w kategoriach przychodowych:{" "}
              <span className="font-mono tabular-nums">{formatZl(data.expensesInIncomeCats.amount)}</span> ({data.expensesInIncomeCats.count})
            </Link>
          )}
          {gapNote && <p className="text-muted-foreground">{gapNote}</p>}
        </div>
      )}

      <div className="mt-3 text-right">
        <Link href="/finanse/dashboard" className="text-xs font-medium text-emerald-700 hover:underline">
          Szczegóły →
        </Link>
      </div>
    </section>
  );
}
