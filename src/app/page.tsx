"use client";

import Link from "next/link";
import { pillars, monthlyGoals, sportAreas } from "@/lib/data";
import { TopNav } from "@/components/dashboard/top-nav";
import { useGarminSync, useGoalsSync, type GoalsSyncState } from "@/lib/storage";
import { calcAllScores, calcOverallScore, type RozwojData, type PracaData, type RehabScoreInput } from "@/lib/scores";
import { DEFAULT_REHAB_PLAN, averagePercent, isPlanActive, monthStartStr, toDateStr, type RehabEntry } from "@/lib/rehab";
import { calorieRangeScore, type CalorieEntry } from "@/lib/calories";
import { useEffect, useMemo, useState } from "react";
import { DEFAULT_READING_SETTINGS, booklyMonthReading, type BooklyReport } from "@/lib/reading";

const MONTHS_PL = [
  "styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec",
  "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień",
];

export default function Home() {
  // Goals from Supabase (with localStorage cache)
  const goalsDefaults: GoalsSyncState = {
    goals: {
      activeCalories: { ...monthlyGoals.activeCalories },
      cycling: { ...monthlyGoals.cycling },
      running: { ...monthlyGoals.running },
      competition: { ...monthlyGoals.competition },
      competitions: [],
      rehab: { ...monthlyGoals.rehab },
      reading: { ...monthlyGoals.reading },
    },
    gymDays: sportAreas[0].weekDays,
    gymWeeklyGoal: sportAreas[0].weeklyGoal,
    gymMonthlyGoal: sportAreas[0].monthlyGoal,
    gymMonthlyDone: sportAreas[0].current,
    runWeeklyGoal: sportAreas[1].weeklyGoal,
    runMonthlyGoal: sportAreas[1].monthlyGoal,
    bikeWeeklyGoal: sportAreas[2].weeklyGoal,
    bikeMonthlyGoal: sportAreas[2].monthlyGoal,
    rozwojTargets: {
      czytanie: { monthly: 300, weekly: 75 },
      sluchanie: { monthly: 600, weekly: 150 },
      pisanie: { monthly: 30, weekly: 8 },
    },
    runEntries: [0, 0, 0, 0, 0, 0, 0],
    bikeEntries: [0, 0, 0, 0, 0, 0, 0],
  };
  const { state: gs } = useGoalsSync(goalsDefaults);
  const goals = gs.goals;
  const gymMonthlyDone = gs.gymMonthlyDone;
  const gymMonthlyGoal = gs.gymMonthlyGoal;
  const rozwojTargets = gs.rozwojTargets;
  const [rozwojData, setRozwojData] = useState<RozwojData | null>(null);
  const [pracaData, setPracaData] = useState<PracaData | null>(null);
  // Garmin cached data
  const garmin = useGarminSync();

  // Try to load cached garmin data on mount (don't force sync)
  useEffect(() => {
    garmin.sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bookly reading reports (czytanie lead: daily minutes goal, default 30)
  const readingMinutes = (goals.reading ?? DEFAULT_READING_SETTINGS).dailyMinutes;
  const [booklyReports, setBooklyReports] = useState<BooklyReport[]>([]);
  useEffect(() => {
    fetch("/api/bookly/reports")
      .then((r) => r.json())
      .then((d) => {
        if (d.reports) setBooklyReports(d.reports);
      })
      .catch(() => {});
  }, []);
  const booklyKey = booklyReports.map((r) => `${r.period_from}${r.period_to}${r.minutes}`).join("|");
  const booklyMonth = useMemo(
    () => booklyMonthReading(booklyReports, toDateStr(new Date()), readingMinutes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [booklyKey, readingMinutes]
  );

  // Load rozwoj entries from Supabase for pillar score
  useEffect(() => {
    const monthStart = new Date();
    monthStart.setDate(1);
    fetch("/api/rozwoj?days=31")
      .then((r) => r.json())
      .then((d) => {
        if (!d.entries) return;
        const ms = monthStart.toISOString().split("T")[0];
        const monthEntries = (d.entries as { area: string; date: string; amount: number }[])
          .filter((e) => e.date >= ms);
        const sum = (area: string) => monthEntries.filter((e) => e.area === area).reduce((s, e) => s + e.amount, 0);
        setRozwojData({
          // Czytanie: Bookly minutes vs daily-minutes goal × covered days; no report this month = not scored
          czytanie: booklyMonth
            ? { monthlyTarget: booklyMonth.target, monthlyDone: booklyMonth.minutes }
            : { monthlyTarget: 0, monthlyDone: 0 },
          sluchanie: { monthlyTarget: rozwojTargets.sluchanie.monthly, monthlyDone: sum("sluchanie") },
          pisanie: { monthlyTarget: rozwojTargets.pisanie.monthly, monthlyDone: sum("pisanie") },
        });
      })
      .catch(() => {});
  }, [rozwojTargets, booklyMonth]);

  // Load praca check-ins for pillar score
  useEffect(() => {
    fetch("/api/praca?days=31")
      .then((r) => r.json())
      .then((d) => {
        if (!d.checkins) return;
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
        const todayStr = now.toISOString().split("T")[0];
        const monthCheckins = (d.checkins as { date: string; dailyPlan: boolean }[])
          .filter((c) => c.date >= monthStart && c.date <= todayStr);
        const daysElapsed = now.getDate();
        const dailyPlanDays = monthCheckins.filter((c) => c.dailyPlan).length;

        // Calculate weeks elapsed this month
        const weekStarts = new Set<string>();
        for (let day = 1; day <= daysElapsed; day++) {
          const dt = new Date(now.getFullYear(), now.getMonth(), day);
          const dow = dt.getDay();
          const diff = dow === 0 ? -6 : 1 - dow;
          const ws = new Date(dt);
          ws.setDate(ws.getDate() + diff);
          weekStarts.add(ws.toISOString().split("T")[0]);
        }
        const weeksElapsed = weekStarts.size;
        const weeksWithGoals = (d.weeksWithGoals as string[]) || [];
        const weeksReviewed = Array.from(weekStarts).filter((ws) => weeksWithGoals.includes(ws)).length;

        setPracaData({ dailyPlanDays, daysElapsed, weeksWithGoals: weeksReviewed, weeksElapsed });
      })
      .catch(() => {});
  }, []);

  // Rehab mode: health score = average daily % of rehab this month
  const rehabPlan = goals.rehab ?? DEFAULT_REHAB_PLAN;
  const todayStr = toDateStr(new Date());
  const rehabActive = isPlanActive(rehabPlan, todayStr);
  const rehabFrom = monthStartStr(todayStr) > rehabPlan.start ? monthStartStr(todayStr) : rehabPlan.start;
  const [rehabEntries, setRehabEntries] = useState<RehabEntry[]>([]);
  const [calorieEntries, setCalorieEntries] = useState<CalorieEntry[]>([]);
  useEffect(() => {
    if (!rehabActive) return;
    fetch(`/api/rehab?from=${rehabFrom}&to=${todayStr}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.entries) setRehabEntries(d.entries);
      })
      .catch(() => {});
    fetch(`/api/calories?from=${rehabFrom}&to=${todayStr}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.entries) setCalorieEntries(d.entries);
      })
      .catch(() => {});
  }, [rehabActive, rehabFrom, todayStr]);
  const rehab: RehabScoreInput | null = rehabActive
    ? {
        monthAvg: averagePercent(rehabEntries, rehabFrom, rehabPlan.end, todayStr).avg,
        caloriesScore: calorieRangeScore(calorieEntries, rehabFrom, todayStr),
      }
    : null;

  // Calculate dynamic pillar scores
  const scores = calcAllScores(garmin.data, goals, gymMonthlyDone, gymMonthlyGoal, rozwojData, pracaData, rehab);

  // Apply scores to pillars
  const dynamicPillars = pillars.map((p) => {
    const s = scores[p.id];
    if (s) return { ...p, score: s.score, trend: s.trend, subcategories: s.subcategories };
    return p;
  });

  // Overall = average of ALL 4 pillars (25% each); pillar without goals/progress = 0
  const overall = calcOverallScore(scores);
  const now = new Date();
  const monthLabel = `${MONTHS_PL[now.getMonth()]} ${now.getFullYear()}`;
  const pillarById = Object.fromEntries(dynamicPillars.map((p) => [p.id, p]));
  const scoreColor = (v: number) => (v >= 65 ? "#22c55e" : v >= 40 ? "#f59e0b" : v > 0 ? "#ef4444" : "#9ca3af");

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 pb-10 sm:px-6 lg:px-8">
        <TopNav />

        {/* ── Main score ─────────────────────────────────────── */}
        <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm sm:mt-8 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Wynik główny · {monthLabel}
          </p>
          <div className="mt-2 flex items-end gap-3">
            <span className="text-7xl font-black leading-none tracking-tight tabular-nums sm:text-8xl" style={{ color: scoreColor(overall.score) }}>
              {overall.score}
            </span>
            <span className="pb-2 text-2xl font-bold text-muted-foreground">/ 100</span>
          </div>

          {/* Exact formula */}
          <div className="mt-5 rounded-xl bg-muted/50 px-3 py-3 text-sm">
            <p className="text-xs font-medium text-muted-foreground">Jak liczony</p>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 tabular-nums text-foreground">
              <span>(</span>
              {overall.parts.map((part, i) => (
                <span key={part.id} className="inline-flex items-center gap-1">
                  {i > 0 && <span className="text-muted-foreground">+</span>}
                  <span>{pillarById[part.id]?.icon}</span>
                  <span className="font-semibold" style={{ color: scoreColor(part.score) }}>{part.score}</span>
                </span>
              ))}
              <span>) ÷ 4 =</span>
              <span className="font-bold" style={{ color: scoreColor(overall.score) }}>{overall.score}</span>
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Każdy z 4 filarów waży 25%. Filar bez celów albo bez postępu w tym miesiącu liczy się jako 0 — nie jest pomijany.
              Okres: bieżący miesiąc (od 1. do dziś).
            </p>
          </div>
        </section>

        {/* ── Pillar tiles ───────────────────────────────────── */}
        <section className="mt-4 grid grid-cols-2 gap-3 sm:gap-4">
          {overall.parts.map((part) => {
            const p = pillarById[part.id];
            if (!p) return null;
            const subs = p.subcategories ?? [];
            return (
              <Link
                key={p.id}
                href={p.href}
                className="group rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:p-5"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{p.icon}</span>
                  <span className="truncate text-sm font-medium text-foreground">{p.name}</span>
                </div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-4xl font-bold tabular-nums" style={{ color: scoreColor(part.score) }}>
                    {part.score}
                  </span>
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(part.score, 100)}%`, backgroundColor: scoreColor(part.score) }} />
                </div>
                <p className="mt-2 truncate text-[11px] text-muted-foreground">
                  {part.hasGoals
                    ? subs.map((s) => `${s.icon} ${s.label} ${s.pct}%`).join(" · ")
                    : "brak celów — liczy się jako 0"}
                </p>
              </Link>
            );
          })}
        </section>

        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          <span className="text-green-600">65+</span> na dobrej drodze · <span className="text-amber-600">40–64</span> wymaga uwagi ·{" "}
          <span className="text-red-600">&lt;40</span> poniżej celu
        </p>
      </div>
    </div>
  );
}
