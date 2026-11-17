"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BackButton } from "@/components/dashboard/back-button";
import { CategoryIcon } from "@/components/finanse/CategoryIcon";
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
  bigCount: number;
  unreviewedInPeriod: number;
  unreviewedTotal: number;
  lastReviewedAt: string | null;
  lastTransactionDate: string | null;
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
            <p className="text-xs font-bold uppercase tracking-widest text-[#A9C9B5]">WIG · koszty życia</p>
            <p className="text-xl font-semibold leading-snug">
              Z <span className="font-mono">[BAZA]</span> do <span className="font-mono">[CEL]</span> zł/mies. do 31.12.2027
            </p>
            <p className="text-sm text-[#C9D8CE]">Bez wydatków jednorazowych. Bazę ustalimy po 6–8 tygodniach pomiaru.</p>
          </div>
          <div className="flex flex-col gap-2 md:border-l md:border-[#3B5A48] md:pl-6">
            <p className="text-xs font-bold uppercase tracking-widest text-[#A9C9B5]">Lead 1 · przegląd tygodniowy</p>
            <p className="font-mono text-3xl font-bold">{data ? data.unreviewedTotal : "—"}</p>
            <p className="text-sm text-[#C9D8CE]">
              transakcji czeka na przegląd
              {data?.lastReviewedAt ? ` · ostatni ${shortDate(data.lastReviewedAt.slice(0, 10))}` : ""}
            </p>
            <Link href="/finanse/przeglad" className="mt-1 w-fit rounded-xl bg-[#8FD1A8] px-4 py-2 text-sm font-semibold text-[#1F3A2C] hover:bg-[#a6dcbb]">
              Zrób przegląd
            </Link>
          </div>
          <div className="flex flex-col gap-2 md:border-l md:border-[#3B5A48] md:pl-6">
            <p className="text-xs font-bold uppercase tracking-widest text-[#A9C9B5]">Lead 2 · uznaniowe w tym tygodniu</p>
            <p className="font-mono text-3xl font-bold">{data ? formatZl(data.weekDiscretionary) : "—"}</p>
            <p className="text-sm text-[#C9D8CE]">
              od {data ? shortDate(data.weekStart) : "pn"} · limit ustalimy z bazy (restauracje, zakupy, czas wolny)
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
                    {openCat.subcategories.map((s) => (
                      <li key={s.id ?? "__none__"} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold ${KIND_META[s.kind ?? "unassigned"].chip}`} title={KIND_META[s.kind ?? "unassigned"].label}>
                            {KIND_META[s.kind ?? "unassigned"].short}
                          </span>
                          <span className="truncate">{s.name}</span>
                        </span>
                        <span className="whitespace-nowrap font-mono tabular-nums">
                          {formatZl(s.amount)} <span className="text-muted-foreground">· {s.count}×</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">Najwięcej u</h3>
                  <ul className="mt-2 divide-y divide-border">
                    {openCat.topMerchants.map((m) => (
                      <li key={m.name} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <span className="min-w-0 truncate text-muted-foreground">{m.name}</span>
                        <span className="whitespace-nowrap font-mono tabular-nums">
                          {formatZl(m.amount)} <span className="text-muted-foreground">· {m.count}×</span>
                        </span>
                      </li>
                    ))}
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
                  <p>
                    Zwroty przewyższające wydatki:{" "}
                    {data.netNegativeCategories.map((c) => `${c.name} +${formatZl(c.amount)}`).join(", ")}
                  </p>
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
                  <Decision href="/finanse/przeglad" n={data.bigCount} text={`wydatków ≥ 1 000 zł w okresie — oznacz jednorazowe`} warn={data.bigCount > 0} />
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

function Decision({ href, n, text, warn }: { href: string; n: number; text: string; warn: boolean }) {
  return (
    <Link href={href} className={`flex items-center gap-3 rounded-xl p-3 text-sm hover:opacity-90 ${warn ? "bg-amber-50" : "bg-muted"}`}>
      <span className={`min-w-[2.5rem] font-mono text-lg font-bold tabular-nums ${warn ? "text-amber-800" : "text-muted-foreground"}`}>{n}</span>
      <span className="leading-snug text-foreground">{text}</span>
    </Link>
  );
}
