"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AREAS, formatScore, type AreaKey } from "@/lib/wig-score";
import { formatDayMonthPl } from "@/lib/dates";
import { ratingColor, wigGet, type SummaryT } from "./client";

const areaHref = (k: AreaKey) => `/wig/${k}`;

/** Main WIG score 1–6 (4 closed weeks), short trend and the 4 areas. Used on the home page and on /wig. */
export function WigScoreCard({ compact = false }: { compact?: boolean }) {
  const [s, setS] = useState<SummaryT | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    wigGet<SummaryT>({ view: "summary" }).then(setS).catch((e) => setErr(e.message));
  }, []);

  const planHref = s ? `/wig/sesja/${s.planningWeek}` : "/wig";
  const planned = s?.planningStatus === "zatwierdzony";
  const score = s?.score;
  const trend = (s?.history ?? []).filter((h) => h.weekMain !== null).slice(-8);

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm sm:mt-8 sm:p-8" data-testid="wig-score-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Wynik WIG · 4 tygodnie</p>
        {score && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground" title="Zamknięte tygodnie w oknie">
            {score.closedWeeks}/4 {score.provisional ? "· prowizoryczny" : ""}
          </span>
        )}
      </div>

      {err && <p className="mt-3 text-sm text-red-600" role="alert">Nie wczytano wyniku WIG: {err}</p>}

      <div className="mt-2 flex items-end gap-3">
        <span className="text-7xl font-black leading-none tracking-tight tabular-nums sm:text-8xl" style={{ color: ratingColor(score?.value ?? null) }} data-testid="wig-main">
          {score ? formatScore(score.value) : "…"}
        </span>
        <span className="pb-2 text-2xl font-bold text-muted-foreground">/ 6</span>
      </div>
      {score && score.value === null && (
        <p className="mt-2 text-sm text-muted-foreground">
          Brak danych{score.closedWeeks === 0 ? " — żaden tydzień nie jest jeszcze zamknięty" : ` dla: ${score.missingAreas.map((a) => AREAS.find((x) => x.key === a)?.short).join(", ")}`}. Wynik pojawi się po pierwszej niedzielnej sesji.
        </p>
      )}

      {trend.length > 1 && (
        <div className="mt-3 flex items-end gap-1" aria-label="Trend tygodniowy">
          {trend.map((h) => (
            <div key={h.weekStart} className="flex flex-col items-center gap-0.5" title={`${formatDayMonthPl(h.weekStart)}: ${formatScore(h.weekMain)}`}>
              <div className="w-5 rounded-sm" style={{ height: `${Math.max(4, ((h.weekMain ?? 0) / 6) * 36)}px`, backgroundColor: ratingColor(h.weekMain) }} />
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {AREAS.map((a) => {
          const w = score?.areas.find((x) => x.area === a.key);
          return (
            <Link key={a.key} href={areaHref(a.key)} className="min-w-0 rounded-xl border border-border bg-background p-3 transition-colors hover:border-stone-400" data-testid={`wig-area-${a.key}`}>
              <p className="flex items-center gap-1.5 truncate text-xs font-medium text-muted-foreground">
                <span>{a.icon}</span>
                <span className="truncate">{a.short}</span>
                <span className="ml-auto shrink-0">{Math.round(a.weight * 100)}%</span>
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: ratingColor(w?.value ?? null) }}>
                {w ? formatScore(w.value) : "…"}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">{w ? (w.value === null ? "brak danych" : `tygodnie z danymi: ${w.weeksWithData}`) : ""}</p>
            </Link>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link href={planHref} className="inline-flex h-10 items-center rounded-full bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800" data-testid="wig-plan-cta">
          {planned ? "Sesja WIG" : "Zaplanuj tydzień"}
          {s && <span className="ml-1.5 font-normal opacity-90">{formatDayMonthPl(s.planningWeek)}</span>}
        </Link>
        {!compact && (
          <Link href="/wig" className="inline-flex h-10 items-center rounded-full border border-border px-4 text-sm text-muted-foreground hover:text-foreground">
            Szczegóły i historia
          </Link>
        )}
      </div>
      {!compact && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Średnia ważona ocen obszarów (Rozwój 30%, Zdrowie 30%, Praca 25%, Relacje 15%) z ostatnich 4 zamkniętych tygodni. LEAD-y liczbowe: najpierw realizacja w oknie (max 150% na tydzień), potem ocena. Relacje: samoocena ważona 10/20/30/40 (nowsze tygodnie ważniejsze). Niezależne od wyniku miesięcznego 0–100 i finansów.
        </p>
      )}
    </section>
  );
}
