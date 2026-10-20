"use client";

import {
  addDays,
  averagePercent,
  monthStartStr,
  toDateStr,
  weekStartStr,
  type RehabEntry,
  type RehabPlan,
} from "@/lib/rehab";
import {
  HEALTH_WEIGHTS,
  calorieRangeScore,
  calorieWeekScore,
  healthWigScore,
  type CalorieEntry,
} from "@/lib/calories";

function fmtDate(s: string): string {
  const [y, m, d] = s.split("-");
  return `${d}.${m}.${y}`;
}

function scoreColor(v: number | null): string {
  if (v === null) return "#9ca3af";
  if (v >= 85) return "#22c55e";
  if (v >= 50) return "#f59e0b";
  return "#ef4444";
}

function Breakdown({
  title,
  rehab,
  calories,
  note,
}: {
  title: string;
  rehab: number | null;
  calories: number | null;
  note?: string;
}) {
  const total = healthWigScore(rehab, calories);
  const both = rehab !== null && calories !== null;
  const row = (icon: string, label: string, v: number | null, w: number) => (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">
        {icon} {label}
      </span>
      <span className="tabular-nums text-foreground">
        {v === null ? (
          <span className="text-muted-foreground">brak danych</span>
        ) : both ? (
          <>
            {v}% × {Math.round(w * 100)}% = <span className="font-semibold">{Math.round(v * w)} pkt</span>
          </>
        ) : (
          <>{v}%</>
        )}
      </span>
    </div>
  );
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-foreground">{title}</span>
        <span className="text-lg font-bold tabular-nums" style={{ color: scoreColor(total) }}>
          {total === null ? "—" : `${total}%`}
        </span>
      </div>
      <div className="mt-1 space-y-0.5">
        {row("🩺", "Rehabilitacja", rehab, HEALTH_WEIGHTS.rehab)}
        {row("🍽", "Kalorie", calories, HEALTH_WEIGHTS.calories)}
      </div>
      {!both && total !== null && (
        <p className="mt-1 text-[11px] text-muted-foreground">Jedna część bez danych — liczy się tylko druga.</p>
      )}
      {note && <p className="mt-1 text-[11px] text-red-600">{note}</p>}
    </div>
  );
}

export function HealthWigCard({
  plan,
  rehabEntries,
  calorieEntries,
}: {
  plan: RehabPlan;
  rehabEntries: RehabEntry[];
  calorieEntries: CalorieEntry[];
}) {
  const today = toDateStr(new Date());
  const clamp = (s: string) => (s > plan.start ? s : plan.start);
  const weekFrom = clamp(weekStartStr(today));
  const monthFrom = clamp(monthStartStr(today));

  const rehabWeek = averagePercent(rehabEntries, weekFrom, plan.end, today).avg;
  const rehabMonth = averagePercent(rehabEntries, monthFrom, plan.end, today).avg;
  const calWeek = calorieWeekScore(calorieEntries, weekFrom, addDays(weekStartStr(today), 6), today);
  const calMonth = calorieRangeScore(calorieEntries, monthFrom, today);

  const penaltyNote =
    calWeek && (calWeek.penalty > 0 || calWeek.missingDates.length > 0)
      ? `Kalorie obniżone karą${calWeek.penalty > 0 ? ` za przekroczenie (−${calWeek.penalty} pkt)` : ""}${
          calWeek.missingDates.length > 0 ? `${calWeek.penalty > 0 ? " i" : ""} za brak wpisów (× ${Math.round(calWeek.loggingFactor * 100)}%)` : ""
        } — szczegóły w karcie Kalorie`
      : undefined;

  const rehabToday = rehabEntries.some((e) => e.date === today);
  const calToday = calorieEntries.some((e) => e.date === today);

  return (
    <div className="mt-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-2">
        <span className="text-2xl">🎯</span>
        <div>
          <h4 className="font-semibold text-foreground">WIG: Zdrowie i Fitness — 100%</h4>
          <p className="text-xs text-muted-foreground">
            z {fmtDate(plan.start)} do {fmtDate(plan.end)} · Rehabilitacja {Math.round(HEALTH_WEIGHTS.rehab * 100)}% + Kalorie{" "}
            {Math.round(HEALTH_WEIGHTS.calories * 100)}%
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Breakdown title="Ten tydzień" rehab={rehabWeek} calories={calWeek?.score ?? null} note={penaltyNote} />
        <Breakdown title="Ten miesiąc (wynik na stronie głównej)" rehab={rehabMonth} calories={calMonth} />
      </div>

      {/* Lead measures for today */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Leady na dziś:</span>
        <span className={`rounded-full px-2 py-0.5 ${rehabToday ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
          🩺 rehabilitacja {rehabToday ? "✓" : "— do wpisania"}
        </span>
        <span className={`rounded-full px-2 py-0.5 ${calToday ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
          🍽 kalorie {calToday ? "✓" : "— do wpisania"}
        </span>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">Jak liczone?</summary>
        <div className="mt-2 space-y-1 rounded-lg bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
          <p><span className="font-medium text-foreground">WIG Zdrowie</span> = Rehabilitacja × 70% + Kalorie × 30%.</p>
          <p><span className="font-medium text-foreground">Rehabilitacja (WIG 1)</span>: średnia dzienna % wykonania zaleceń. Dzień bez wpisu = 0%.</p>
          <p><span className="font-medium text-foreground">Kalorie (WIG 2)</span>: bilans tygodnia vs budżet 2000 kcal/dzień, z karami opisanymi w karcie Kalorie.</p>
          <p><span className="font-medium text-foreground">Leady</span>: codzienne wpisy — % rehabilitacji i zjedzone kcal.</p>
        </div>
      </details>
    </div>
  );
}
