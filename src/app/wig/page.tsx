"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TopNav } from "@/components/dashboard/top-nav";
import { WigScoreCard } from "@/components/wig/WigScoreCard";
import { wigGet, ratingColor, type SummaryT } from "@/components/wig/client";
import { Card, ErrorBanner, StatusPill, weekStatusLabel } from "@/components/wig/ui";
import { AREAS, formatPct, formatScore } from "@/lib/wig-score";
import { formatDayMonthPl } from "@/lib/dates";
import { weekEnd } from "@/lib/wig-model";

export default function WigPage() {
  const [s, setS] = useState<SummaryT | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { wigGet<SummaryT>({ view: "summary" }).then(setS).catch((e) => setError(e.message)); }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        <TopNav />
        <h1 className="mt-5 text-2xl font-bold text-foreground">WIG — cotygodniowe sesje</h1>
        <ErrorBanner error={error} onClose={() => setError(null)} />
        <WigScoreCard compact />

        {s && (
          <Card className="mt-4" data-testid="wig-window">
            <h2 className="font-bold">Jak powstał wynik</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Okno: {s.score.windowWeeks.map((w) => formatDayMonthPl(w)).join(" · ")} — zamknięte {s.score.closedWeeks}/4{s.score.provisional ? " (wynik prowizoryczny)" : ""}. Algorytm {s.score.algorithm}.
            </p>
            <div className="mt-3 space-y-3">
              {s.score.areas.map((a) => {
                const meta = AREAS.find((x) => x.key === a.area)!;
                return (
                  <div key={a.area} className="min-w-0">
                    <p className="flex flex-wrap items-baseline gap-2 text-sm">
                      <span className="font-semibold">{meta.icon} {meta.short}</span>
                      <span className="text-muted-foreground">waga {Math.round(meta.weight * 100)}%</span>
                      <span className="ml-auto font-bold" style={{ color: ratingColor(a.value) }}>{formatScore(a.value)}</span>
                    </p>
                    {a.area === "relacje" ? (
                      <p className="text-xs text-muted-foreground">Samoocena ważona 10/20/30/40 (nowsze tygodnie ważniejsze), tygodnie z danymi: {a.weeksWithData}.</p>
                    ) : a.leads.length ? (
                      <ul className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
                        {a.leads.map((l) => <li key={l.leadKey} className="break-words">{l.name}: {formatPct(l.realization)} w {l.weeks} tyg.{l.droppedWeeks ? ` (pominięto ${l.droppedWeeks} tyg. o innej definicji)` : ""}</li>)}
                        <li>Realizacja obszaru w oknie: {formatPct(a.realization)} → ocena {formatScore(a.value)}</li>
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground">brak danych w oknie</p>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        <Card className="mt-4" data-testid="wig-history">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-bold">Historia tygodni</h2>
            <Link href="/wig/rocks" className="ml-auto text-sm font-semibold text-emerald-700">ROCKS kwartału →</Link>
          </div>
          {s && s.history.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Jeszcze nic — zacznij od planu na {formatDayMonthPl(s.planningWeek)}.</p>}
          <ul className="mt-2 divide-y divide-border">
            {s?.history.slice().reverse().map((h) => {
              const st = weekStatusLabel({ planStatus: h.planStatus, closeStatus: h.closeStatus });
              return (
                <li key={h.weekStart} className="py-2">
                  <Link href={`/wig/sesja/${h.weekStart}?krok=${h.closeStatus ? "przeglad" : "plan"}`} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold">{formatDayMonthPl(h.weekStart)} – {formatDayMonthPl(weekEnd(h.weekStart))}</span>
                    <StatusPill tone={st.tone}>{st.text}{h.version && h.version > 1 ? ` v${h.version}` : ""}</StatusPill>
                    <span className="ml-auto font-bold" style={{ color: ratingColor(h.weekMain) }}>{h.closeStatus ? formatScore(h.weekMain) : ""}</span>
                  </Link>
                  {h.areaResults && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Rozwój {h.areaResults.rozwoj?.rating ?? "—"} · Zdrowie {h.areaResults.zdrowie?.rating ?? "—"} · Praca {h.areaResults.praca?.rating ?? "—"} · Relacje {formatScore(h.relationValue)}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}
