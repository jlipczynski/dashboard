"use client";

import {
  addDays,
  averagePercent,
  daysInclusive,
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

function statusLabel(v: number | null): { text: string; cls: string } {
  if (v === null) return { text: "Brak danych — wpisz dzisiejsze leady", cls: "bg-muted text-muted-foreground" };
  if (v >= 85) return { text: "✓ Na dobrej drodze", cls: "bg-green-100 text-green-700" };
  if (v >= 50) return { text: "⚠ Wymaga uwagi", cls: "bg-amber-100 text-amber-700" };
  return { text: "✗ Poniżej celu", cls: "bg-red-100 text-red-700" };
}

function BigRing({ value, size = 132 }: { value: number | null; size?: number }) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.min(Math.max(value ?? 0, 0), 100);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={scoreColor(value)}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold tabular-nums" style={{ color: scoreColor(value) }}>
          {value === null ? "—" : value}
          {value !== null && <span className="text-xl">%</span>}
        </span>
        <span className="text-[11px] text-muted-foreground">ten tydzień</span>
      </div>
    </div>
  );
}

function PartRow({
  icon,
  label,
  value,
  weight,
  weighted,
}: {
  icon: string;
  label: string;
  value: number | null;
  weight: number;
  weighted: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-foreground">
          {icon} {label} <span className="text-xs text-muted-foreground">· waga {Math.round(weight * 100)}%</span>
        </span>
        <span className="tabular-nums text-foreground">
          {value === null ? (
            <span className="text-xs text-muted-foreground">brak danych</span>
          ) : (
            <>
              <span className="font-semibold">{value}%</span>
              {weighted && (
                <span className="text-xs text-muted-foreground"> → {Math.round(value * weight)} pkt</span>
              )}
            </>
          )}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.min(value ?? 0, 100)}%`, backgroundColor: scoreColor(value) }}
        />
      </div>
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
  const calWeekScore = calWeek?.score ?? null;
  const calMonth = calorieRangeScore(calorieEntries, monthFrom, today);

  const weekTotal = healthWigScore(rehabWeek, calWeekScore);
  const monthTotal = healthWigScore(rehabMonth, calMonth);
  const status = statusLabel(weekTotal);
  const bothWeek = rehabWeek !== null && calWeekScore !== null;

  const planDays = daysInclusive(plan.start, plan.end);
  const dayOfPlan = Math.min(Math.max(daysInclusive(plan.start, today), 0), planDays);

  const penaltyNote =
    calWeek && (calWeek.penalty > 0 || calWeek.missingDates.length > 0)
      ? `Kalorie obniżone karą${calWeek.penalty > 0 ? ` za przekroczenie (−${calWeek.penalty} pkt)` : ""}${
          calWeek.missingDates.length > 0
            ? `${calWeek.penalty > 0 ? " i" : ""} za brak wpisów (× ${Math.round(calWeek.loggingFactor * 100)}%)`
            : ""
        } — szczegóły w karcie Kalorie`
      : null;

  const rehabToday = rehabEntries.some((e) => e.date === today);
  const calToday = calorieEntries.some((e) => e.date === today);

  return (
    <div className="mt-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">🎯 WIG · Zdrowie i Fitness</p>
          <p className="mt-0.5 text-sm text-foreground">
            100% do {fmtDate(plan.end)} · Rehabilitacja {Math.round(HEALTH_WEIGHTS.rehab * 100)}% + Kalorie{" "}
            {Math.round(HEALTH_WEIGHTS.calories * 100)}%
          </p>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground tabular-nums">
          Dzień {dayOfPlan} / {planDays}
        </span>
      </div>

      <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <BigRing value={weekTotal} />
        <div className="w-full flex-1 space-y-3">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${status.cls}`}>{status.text}</span>
          <PartRow icon="🩺" label="Rehabilitacja" value={rehabWeek} weight={HEALTH_WEIGHTS.rehab} weighted={bothWeek} />
          <PartRow icon="🍽" label="Kalorie" value={calWeekScore} weight={HEALTH_WEIGHTS.calories} weighted={bothWeek} />
          {!bothWeek && weekTotal !== null && (
            <p className="text-[11px] text-muted-foreground">Jedna część bez danych — wynik liczy się tylko z drugiej.</p>
          )}
          {penaltyNote && <p className="text-[11px] text-red-600">{penaltyNote}</p>}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">Leady na dziś:</span>
          <span className={`rounded-full px-2 py-0.5 ${rehabToday ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
            🩺 {rehabToday ? "✓" : "do wpisania"}
          </span>
          <span className={`rounded-full px-2 py-0.5 ${calToday ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
            🍽 {calToday ? "✓" : "do wpisania"}
          </span>
        </div>
        <span className="text-muted-foreground">
          Miesiąc (strona główna):{" "}
          <span className="font-semibold tabular-nums" style={{ color: scoreColor(monthTotal) }}>
            {monthTotal === null ? "—" : `${monthTotal}%`}
          </span>
        </span>
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">Jak liczone?</summary>
        <div className="mt-2 space-y-1 rounded-lg bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
          <p><span className="font-medium text-foreground">WIG Zdrowie</span> = Rehabilitacja × 70% + Kalorie × 30%. Duża liczba = bieżący tydzień (od poniedziałku).</p>
          <p><span className="font-medium text-foreground">Rehabilitacja (WIG 1)</span>: średnia dzienna % wykonania zaleceń. Dzień bez wpisu = 0%.</p>
          <p><span className="font-medium text-foreground">Kalorie (WIG 2)</span>: bilans tygodnia vs budżet 2000 kcal/dzień, z karami opisanymi w karcie Kalorie.</p>
          <p><span className="font-medium text-foreground">Leady</span>: codzienne wpisy — % rehabilitacji i zjedzone kcal. Dzisiejszy dzień liczy się po wpisaniu.</p>
          <p><span className="font-medium text-foreground">Miesiąc</span>: to samo dla bieżącego miesiąca — ten wynik widać na stronie głównej.</p>
        </div>
      </details>
    </div>
  );
}
