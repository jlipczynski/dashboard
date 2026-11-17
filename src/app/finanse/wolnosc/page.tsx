"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BackButton } from "@/components/dashboard/back-button";
import { FinanseNav } from "@/components/finanse/FinanseNav";
import { formatZl } from "@/lib/finanse-period";
import {
  LIMITS,
  RISK_PRESETS,
  clampParams,
  freedom,
  paramsFromDefaults,
  type FreedomDefaults,
  type FreedomParams,
  type ParamStatus,
  type Strategy,
} from "@/lib/finanse-wolnosc";

// /finanse/wolnosc — "Moja liczba wolności": one interactive screen. Sliders on top, results below,
// recalculated on every change. Moving a slider NEVER changes real data: everything here is local state;
// the only write is saving a scenario (finance_freedom_scenarios).

type Key = "capital" | "expenses" | "income" | "age" | "endAge" | "realReturn" | "bequest";
type Saved = { id: string; name: string; params: FreedomParams; data_source: Record<string, unknown>; created_at: string };

const GREEN = "#1F3A2C";
const SERIES = { cautious: "#C2701E", base: "#12845A", favorable: "#3A5FD0" } as const; // validated (dataviz), + dashes & labels
const STATUS_LABEL: Record<ParamStatus, string> = {
  verified: "Dane zweryfikowane",
  estimate: "Szacunek",
  scenario: "Wartość scenariusza",
  missing: "Brak danych — wartość robocza",
};
const STATUS_CLS: Record<ParamStatus, string> = {
  verified: "bg-emerald-50 text-emerald-800",
  estimate: "bg-amber-50 text-amber-800",
  scenario: "bg-slate-100 text-slate-700",
  missing: "bg-red-50 text-red-700",
};
const PRESET_NAMES = ["Zachowuję kapitał", "Życie do 85 lat", "Życie do 95 lat", "Pozostawiam 2 mln zł dzieciom", "Wyższe wydatki na podróże"];

const pct = (v: number) => `${(v * 100).toFixed(1).replace(".", ",")}%`;
const ageLabel = (a: number) => {
  const y = Math.floor(a + 1e-9);
  const m = Math.round((a - y) * 12);
  return m > 0 ? `${y} lat ${m} mies.` : `${y} lat`;
};
const axisZl = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1).replace(".", ",")} mln` : v >= 1000 ? `${Math.round(v / 1000)} tys.` : String(Math.round(v)));

export default function FinanseWolnoscPage() {
  const [defaults, setDefaults] = useState<FreedomDefaults | null>(null);
  const [dataSource, setDataSource] = useState<Record<string, unknown>>({});
  const [params, setParams] = useState<FreedomParams | null>(null);
  const [status, setStatus] = useState<Record<Key, ParamStatus> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);

  function restore(d: FreedomDefaults, strategy: Strategy = "preserve") {
    setParams(paramsFromDefaults(d, strategy));
    setStatus({
      capital: d.capital.status,
      expenses: d.expenses.status,
      income: d.income.status,
      age: d.age.status,
      endAge: d.endAge.status,
      realReturn: d.realReturn.status,
      bequest: d.bequest.status,
    });
  }

  useEffect(() => {
    fetch("/api/finanse/wolnosc", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setDefaults(d.defaults);
        setDataSource(d.dataSource ?? {});
        restore(d.defaults);
      })
      .catch(() => setError("Nie udało się pobrać danych z Dashboardu."));
  }, []);

  const p = useMemo(() => (params ? clampParams(params) : null), [params]);
  const res = useMemo(() => (p ? freedom(p) : null), [p]);

  function set<K extends keyof FreedomParams>(key: K, value: FreedomParams[K]) {
    setParams((prev) => (prev ? { ...prev, [key]: value } : prev));
    if (key in (status ?? {})) setStatus((s) => (s ? { ...s, [key as Key]: "scenario" } : s));
  }

  const chart = useMemo(
    () =>
      res
        ? res.base.points.map((pt, i) => ({
            age: Math.round(pt.age * 10) / 10,
            base: pt.capital,
            cautious: res.cautious.points[i]?.capital ?? 0,
            favorable: res.favorable.points[i]?.capital ?? 0,
            withdrawal: pt.withdrawal,
          }))
        : [],
    [res]
  );

  const notes: Partial<Record<Key, string>> = defaults
    ? {
        capital: defaults.capital.note,
        expenses: defaults.expenses.note,
        income: defaults.income.note,
        age: defaults.age.note,
        endAge: defaults.endAge.note,
        realReturn: defaults.realReturn.note,
        bequest: defaults.bequest.note,
      }
    : {};

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <BackButton />
        <FinanseNav active="dashboard" />

        <header className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Finanse · symulator</p>
          <h1 className="mt-1 text-3xl font-bold text-foreground">Moja liczba wolności</h1>
          <p className="mt-1 italic text-muted-foreground">Ile mogę wydawać, jak długo wystarczy mi kapitału i ile pozostawię po sobie?</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Dane domyślne z Dashboardu{typeof dataSource.asOf === "string" ? ` · stan na ${new Date(dataSource.asOf).toLocaleDateString("pl-PL")}` : ""}. Wszystkie kwoty w
            dzisiejszej sile nabywczej. Zmiana suwaków nie zmienia żadnych Twoich danych.
          </p>
        </header>

        {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {!p || !res || !status ? (
          !error && <p className="mt-6 text-sm text-muted-foreground">Ładowanie…</p>
        ) : (
          <>
            {/* Strategy */}
            <div role="radiogroup" aria-label="Scenariusz" className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(
                [
                  ["preserve", "Zachowuję kapitał", "Wydaję tyle, by realna wartość kapitału nie malała."],
                  ["consume", "Świadomie zużywam kapitał", `Finansuję życie z dochodów i kapitału do ${p.endAge} lat.`],
                ] as const
              ).map(([key, title, sub]) => {
                const on = p.strategy === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => set("strategy", key)}
                    className={`rounded-2xl border p-4 text-left transition-colors ${on ? "border-transparent text-white" : "border-border bg-white text-foreground hover:border-stone-300"}`}
                    style={on ? { backgroundColor: GREEN } : undefined}
                  >
                    <span className="block text-sm font-bold uppercase tracking-wider">{title}</span>
                    <span className={`mt-1 block text-sm ${on ? "text-[#C9D8CE]" : "text-muted-foreground"}`}>{sub}</span>
                  </button>
                );
              })}
            </div>

            {/* Sliders */}
            <section aria-label="Parametry" className="mt-4 rounded-3xl border border-border bg-white p-5 sm:p-6">
              <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2 xl:grid-cols-3">
                <Slider label="Kapitał początkowy" k="capital" value={p.capital} min={0} max={LIMITS.capital.max} step={10_000} unit="zł" status={status.capital} note={notes.capital} onChange={(v) => set("capital", v)} />
                <Slider label="Miesięczne wydatki" k="expenses" value={p.expenses} min={0} max={LIMITS.expenses.max} step={100} unit="zł/mies." status={status.expenses} note={notes.expenses} onChange={(v) => set("expenses", v)} />
                <Slider label="Pozostałe trwałe dochody netto" k="income" value={p.income} min={0} max={LIMITS.income.max} step={100} unit="zł/mies." status={status.income} note={notes.income} onChange={(v) => set("income", v)} />
                <Slider label="Mój obecny wiek" k="age" value={p.age} min={LIMITS.age.min} max={LIMITS.age.max} step={1} unit="lat" status={status.age} note={notes.age} onChange={(v) => set("age", v)} />
                <Slider
                  label="Do jakiego wieku planuję"
                  k="endAge"
                  value={p.endAge}
                  min={Math.max(LIMITS.endAge.min, p.age + 1)}
                  max={LIMITS.endAge.max}
                  step={1}
                  unit="lat"
                  status={status.endAge}
                  note={notes.endAge}
                  onChange={(v) => set("endAge", v)}
                />
                <Slider
                  label="Realna stopa zwrotu rocznie netto"
                  k="realReturn"
                  value={Math.round(p.realReturn * 1000) / 10}
                  min={LIMITS.realReturn.min * 100}
                  max={LIMITS.realReturn.max * 100}
                  step={0.1}
                  unit="%"
                  status={status.realReturn}
                  note={notes.realReturn}
                  onChange={(v) => set("realReturn", Math.round(v * 10) / 1000)}
                />
                <Slider
                  label="Kapitał pozostawiony na koniec"
                  k="bequest"
                  value={p.bequest}
                  min={0}
                  max={LIMITS.bequest.max}
                  step={50_000}
                  unit="zł"
                  status={status.bequest}
                  note={p.strategy === "consume" ? "Np. dla dzieci — realnie, w dzisiejszych złotych" : "W trybie zachowania zostaje cały kapitał; tu: cel do sprawdzenia"}
                  onChange={(v) => set("bequest", v)}
                />

                {/* Additional settings */}
                <div className="flex flex-col gap-3 md:col-span-2 xl:col-span-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Stopień ryzyka</p>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {(
                        [
                          ["cautious", "Ostrożny"],
                          ["base", "Bazowy"],
                          ["favorable", "Korzystny"],
                        ] as const
                      ).map(([k, label]) => {
                        const on = Math.abs(p.realReturn - RISK_PRESETS[k]) < 1e-9;
                        return (
                          <button
                            key={k}
                            type="button"
                            aria-pressed={on}
                            onClick={() => set("realReturn", RISK_PRESETS[k])}
                            className={`rounded-xl border px-2 py-2 text-sm ${on ? "border-transparent font-semibold text-white" : "border-border text-foreground hover:border-stone-300"}`}
                            style={on ? { backgroundColor: GREEN } : undefined}
                          >
                            {label} · {pct(RISK_PRESETS[k])}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Realne stopy zwrotu przyjęte w modelu. To założenia, nie gwarancje.</p>
                  </div>
                  <label className="flex items-start gap-2 text-sm text-foreground">
                    <input type="checkbox" checked={p.propertyInCapital} onChange={(e) => set("propertyInCapital", e.target.checked)} className="mt-0.5 h-4 w-4" />
                    <span>
                      Wartość nieruchomości na wynajem jest w kapitale (sprzedaję ją)
                      <span className="block text-xs text-muted-foreground">
                        Wtedy czynsz z niej nie jest dochodem — bez podwójnego liczenia. Czynsz w dochodach:{" "}
                        <input
                          type="number"
                          inputMode="numeric"
                          value={p.rentPart}
                          min={0}
                          step={100}
                          aria-label="Czynsz z najmu w dochodach (zł/mies.)"
                          onChange={(e) => set("rentPart", Number(e.target.value))}
                          className="w-24 rounded-md border border-border px-1.5 py-0.5 text-right font-mono text-xs"
                        />{" "}
                        zł/mies.
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-sm text-foreground">
                    <input type="checkbox" checked={p.reinvestSurplus} onChange={(e) => set("reinvestSurplus", e.target.checked)} className="mt-0.5 h-4 w-4" />
                    <span>
                      Nadwyżkę dochodów ponad wydatki reinwestuję w portfel
                      <span className="block text-xs text-muted-foreground">Bez zaznaczenia nadwyżka nie zwiększa kapitału.</span>
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => defaults && restore(defaults, p.strategy)}
                    className="w-fit rounded-xl border border-border px-3 py-1.5 text-sm text-foreground hover:border-stone-300"
                  >
                    Przywróć aktualne dane z Dashboardu
                  </button>
                </div>
              </div>
            </section>

            {/* Four result cards */}
            <section aria-label="Wyniki" className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card title="Mogę wydawać miesięcznie" hero>
                <p className="font-mono text-4xl font-bold tabular-nums">{formatZl(res.canSpend.chosen)}</p>
                <p className="mt-2 text-sm text-[#C9D8CE]">
                  obecne wydatki {formatZl(p.expenses)} ·{" "}
                  {res.canSpend.chosen >= p.expenses ? `zapas ${formatZl(res.canSpend.chosen - p.expenses)}` : `brakuje ${formatZl(p.expenses - res.canSpend.chosen)}`}
                </p>
                {p.strategy === "preserve" && res.r <= 0 && (
                  <p className="mt-1 text-xs text-[#F0C99A]">Przy stopie ≤ 0% nie da się wypłacać z kapitału, zachowując jego realną wartość.</p>
                )}
              </Card>
              <Card title="Potrzebny kapitał">
                {res.incomeCoversExpenses && p.bequest === 0 ? (
                  <p className="font-mono text-2xl font-bold tabular-nums">0 zł</p>
                ) : Number.isFinite(res.requiredCapital.chosen) ? (
                  <p className="font-mono text-2xl font-bold tabular-nums">{formatZl(res.requiredCapital.chosen)}</p>
                ) : (
                  <p className="text-lg font-bold">Nieosiągalny przy stopie ≤ 0%</p>
                )}
                <p className="mt-1 text-sm text-muted-foreground">
                  na obecne wydatki{p.strategy === "consume" ? ` do ${p.endAge} lat` : ", bez uszczuplania kapitału"}
                  {Number.isFinite(res.capitalGap) &&
                    (res.capitalGap > 0 ? ` · brakuje ${formatZl(res.capitalGap)}` : ` · nadwyżka ${formatZl(-res.capitalGap)}`)}
                </p>
              </Card>
              <Card title={`Kapitał w wieku ${p.endAge} lat`}>
                <p className="font-mono text-2xl font-bold tabular-nums">{formatZl(res.base.endCapital)}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  przy obecnych wydatkach, realnie
                  {res.bequestRatio !== null && ` · cel ${formatZl(p.bequest)}: ${Math.min(999, Math.round(res.bequestRatio * 100))}%`}
                </p>
              </Card>
              <Card title="Do jakiego wieku wystarczy?">
                {res.incomeCoversExpenses ? (
                  <>
                    <p className="text-xl font-bold">Kapitał nie musi być zużywany</p>
                    <p className="mt-1 text-sm text-muted-foreground">dochody pokrywają wydatki{res.surplus > 0 ? ` · nadwyżka ${formatZl(res.surplus)}/mies.` : ""}</p>
                  </>
                ) : res.base.depletedAtAge !== null ? (
                  <>
                    <p className="font-mono text-2xl font-bold tabular-nums text-red-700">do {ageLabel(res.base.depletedAtAge)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">potem brakuje {formatZl(res.need)}/mies.</p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold">Co najmniej do {p.endAge} lat</p>
                    <p className="mt-1 text-sm text-muted-foreground">wypłata z portfela {formatZl(res.need)}/mies.</p>
                  </>
                )}
              </Card>
            </section>

            {/* Main chart */}
            <section aria-label="Mój kapitał w czasie" className="mt-4 rounded-3xl border border-border bg-white p-5 sm:p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-bold text-foreground">Mój kapitał w czasie</h2>
                <button type="button" onClick={() => setShowTable((s) => !s)} className="text-sm text-emerald-700 hover:underline">
                  {showTable ? "Pokaż wykres" : "Pokaż tabelę"}
                </button>
              </div>
              <p className="text-sm text-muted-foreground">Realna wartość kapitału przy obecnych wydatkach ({formatZl(p.expenses)}/mies.).</p>
              <ul className="mt-3 flex flex-wrap gap-4 text-sm text-foreground" aria-label="Legenda">
                {(
                  [
                    ["cautious", "Ostrożna", res.rates.cautious, "4 4"],
                    ["base", "Bazowa", res.rates.base, ""],
                    ["favorable", "Korzystna", res.rates.favorable, "8 4"],
                  ] as const
                ).map(([k, label, rate, dash]) => (
                  <li key={k} className="flex items-center gap-2">
                    <svg width="28" height="8" aria-hidden="true">
                      <line x1="0" y1="4" x2="28" y2="4" stroke={SERIES[k]} strokeWidth={k === "base" ? 3 : 2} strokeDasharray={dash} />
                    </svg>
                    {label} · {pct(rate)}
                  </li>
                ))}
              </ul>
              {showTable ? (
                <div className="mt-3 max-h-80 overflow-auto">
                  <table className="w-full text-right text-sm tabular-nums">
                    <thead className="sticky top-0 bg-white text-xs text-muted-foreground">
                      <tr>
                        <th className="py-1 text-left">Wiek</th>
                        <th>Ostrożna</th>
                        <th>Bazowa</th>
                        <th>Korzystna</th>
                        <th>Wypłata/mies.</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {chart.map((r) => (
                        <tr key={r.age} className="border-t border-border">
                          <td className="py-1 text-left">{r.age}</td>
                          <td>{formatZl(r.cautious)}</td>
                          <td>{formatZl(r.base)}</td>
                          <td>{formatZl(r.favorable)}</td>
                          <td>{formatZl(r.withdrawal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-3 h-72 w-full sm:h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chart} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
                      <CartesianGrid stroke="#EEECE8" vertical={false} />
                      <XAxis dataKey="age" type="number" domain={["dataMin", "dataMax"]} tickCount={8} tick={{ fontSize: 12, fill: "#78716C" }} tickLine={false} axisLine={{ stroke: "#E2DFDB" }} />
                      <YAxis tickFormatter={axisZl} width={64} tick={{ fontSize: 12, fill: "#78716C" }} tickLine={false} axisLine={false} />
                      <Tooltip content={<ChartTip />} cursor={{ stroke: "#A8A29E", strokeDasharray: "3 3" }} />
                      <Line type="monotone" dataKey="cautious" name="Ostrożna" stroke={SERIES.cautious} strokeWidth={2} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                      <Line type="monotone" dataKey="favorable" name="Korzystna" stroke={SERIES.favorable} strokeWidth={2} strokeDasharray="8 4" dot={false} isAnimationActive={false} />
                      <Line type="monotone" dataKey="base" name="Bazowa" stroke={SERIES.base} strokeWidth={3} dot={false} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            {/* Strategies & risk */}
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <section aria-label="Porównanie strategii" className="rounded-3xl border border-border bg-white p-5 sm:p-6">
                <h2 className="text-lg font-bold text-foreground">Porównanie strategii</h2>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-border p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Zachowuję kapitał</p>
                    <p className="mt-1 font-mono text-xl font-bold tabular-nums">{formatZl(res.canSpend.preserve)}</p>
                    <p className="text-xs text-muted-foreground">miesięcznie</p>
                  </div>
                  <div className="rounded-2xl border border-border p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Zużywam do {p.endAge} lat</p>
                    <p className="mt-1 font-mono text-xl font-bold tabular-nums">{formatZl(res.canSpend.consume)}</p>
                    <p className="text-xs text-muted-foreground">miesięcznie{p.bequest > 0 ? `, zostawiając ${formatZl(p.bequest)}` : ""}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-foreground">
                  Różnica: <span className="font-mono font-semibold">{formatZl(res.difference.monthly)}</span> miesięcznie ·{" "}
                  <span className="font-mono font-semibold">{formatZl(res.difference.yearly)}</span> rocznie
                </p>
                {res.rentExcluded > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">Czynsz {formatZl(res.rentExcluded)}/mies. pominięty — nieruchomość liczona jest w kapitale.</p>
                )}
              </section>
              <section aria-label="Scenariusze ryzyka" className="rounded-3xl border border-border bg-white p-5 sm:p-6">
                <h2 className="text-lg font-bold text-foreground">Scenariusze ryzyka</h2>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {(
                    [
                      ["cautious", "Ostrożna"],
                      ["base", "Bazowa"],
                      ["favorable", "Korzystna"],
                    ] as const
                  ).map(([k, label]) => {
                    const sim = res[k];
                    return (
                      <div key={k} className="rounded-2xl border border-border p-3">
                        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: SERIES[k] }} aria-hidden="true" />
                          {label} · {pct(res.rates[k])}
                        </p>
                        <p className="mt-1 font-mono text-lg font-bold tabular-nums">{formatZl(sim.endCapital)}</p>
                        <p className="text-xs text-muted-foreground">
                          {res.incomeCoversExpenses ? `w wieku ${p.endAge} lat` : sim.depletedAtAge !== null ? `wyczerpany w wieku ${ageLabel(sim.depletedAtAge)}` : `w wieku ${p.endAge} lat`}
                        </p>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Projekcje przy stałej stopie — nie są prawdopodobieństwami ani gwarancjami.</p>
              </section>
            </div>

            <Scenarios params={p} dataSource={{ ...dataSource, statuses: status }} onLoad={(sp) => {
              setParams(sp);
              setStatus((s) => (s ? (Object.fromEntries(Object.keys(s).map((k) => [k, "scenario"])) as Record<Key, ParamStatus>) : s));
            }} />

            <p className="mt-6 text-xs text-muted-foreground">
              To model deterministyczny, nie gwarancja ani pełna symulacja ryzyka rynkowego. Stopa zwrotu jest realna (po inflacji), po podatkach i kosztach inwestowania;
              dochody nie zawierają zwrotu z symulowanego kapitału.{" "}
              <Link href="/finanse/dashboard" className="text-emerald-700 hover:underline">
                Wróć do Dashboardu
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Slider({
  label,
  k,
  value,
  min,
  max,
  step,
  unit,
  status,
  note,
  onChange,
}: {
  label: string;
  k: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  status: ParamStatus;
  note?: string;
  onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const id = `s-${k}`;
  const commit = (raw: string) => {
    const v = Number(raw.replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
    setDraft(null);
  };
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold text-foreground">
          {label}
        </label>
        <span className="flex items-baseline gap-1">
          <input
            aria-label={`${label} — wpisz wartość`}
            value={draft ?? (unit === "%" ? String(value).replace(".", ",") : String(Math.round(value)))}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commit((e.target as HTMLInputElement).value)}
            inputMode="decimal"
            className="w-28 rounded-lg border border-border px-2 py-1 text-right font-mono text-sm tabular-nums"
          />
          <span className="text-xs text-muted-foreground">{unit}</span>
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-[#1F3A2C]"
      />
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${STATUS_CLS[status]}`}>{STATUS_LABEL[status]}</span>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </div>
    </div>
  );
}

function Card({ title, hero = false, children }: { title: string; hero?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`flex flex-col rounded-2xl p-5 ${hero ? "text-[#F4F1EC]" : "border border-border bg-white text-foreground"}`}
      style={hero ? { backgroundColor: GREEN } : undefined}
    >
      <p className={`text-xs font-bold uppercase tracking-widest ${hero ? "text-[#A9C9B5]" : "text-muted-foreground"}`}>{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function ChartTip({ active, payload, label }: { active?: boolean; payload?: { payload: { base: number; cautious: number; favorable: number; withdrawal: number } }[]; label?: number }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border border-border bg-white px-3 py-2 text-xs shadow-sm">
      <p className="font-semibold text-foreground">Wiek {label}</p>
      <p className="text-foreground">Bazowa: <span className="font-mono">{formatZl(d.base)}</span></p>
      <p className="text-muted-foreground">Ostrożna: <span className="font-mono">{formatZl(d.cautious)}</span></p>
      <p className="text-muted-foreground">Korzystna: <span className="font-mono">{formatZl(d.favorable)}</span></p>
      <p className="mt-1 text-muted-foreground">Wypłata z portfela: <span className="font-mono">{formatZl(d.withdrawal)}</span>/mies.</p>
    </div>
  );
}

function Scenarios({ params, dataSource, onLoad }: { params: FreedomParams; dataSource: Record<string, unknown>; onLoad: (p: FreedomParams) => void }) {
  const [list, setList] = useState<Saved[]>([]);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () =>
    fetch("/api/finanse/wolnosc/scenarios", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setList(d.scenarios ?? []))
      .catch(() => {});
  useEffect(() => {
    load();
  }, []);
  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/finanse/wolnosc/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, params, dataSource }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setMsg(d.error || "Nie zapisano");
      else {
        setName("");
        setMsg("Zapisano wariant.");
        load();
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Moje scenariusze" className="mt-4 rounded-3xl border border-border bg-white p-5 sm:p-6">
      <h2 className="text-lg font-bold text-foreground">Moje scenariusze</h2>
      <p className="text-sm text-muted-foreground">Zapis zachowuje wszystkie parametry i datę. Zapisane warianty się nie zmieniają, gdy zmienią się koszty życia.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {PRESET_NAMES.map((n) => (
          <button key={n} type="button" onClick={() => setName(n)} className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground">
            {n}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Nazwa wariantu" aria-label="Nazwa wariantu" className="min-w-0 flex-1 rounded-xl border border-border px-3 py-2 text-sm" />
        <button type="button" onClick={save} disabled={busy || !name.trim()} className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" style={{ backgroundColor: GREEN }}>
          Zapisz wariant
        </button>
      </div>
      {msg && <p className="mt-2 text-xs text-muted-foreground">{msg}</p>}
      {list.length > 0 && (
        <ul className="mt-3 divide-y divide-border">
          {list.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className="min-w-0">
                <span className="font-medium text-foreground">{s.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {new Date(s.created_at).toLocaleDateString("pl-PL")} · {s.params.strategy === "consume" ? `zużywam do ${s.params.endAge} lat` : "zachowuję kapitał"} · wydatki{" "}
                  {formatZl(s.params.expenses)}/mies. · stopa {pct(s.params.realReturn)}
                </span>
              </span>
              <button type="button" onClick={() => onLoad(s.params)} className="text-sm font-medium text-emerald-700 hover:underline">
                Wczytaj
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
