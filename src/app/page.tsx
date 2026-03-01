"use client";

import Link from "next/link";
import { pillars, monthlyGoals, sportAreas } from "@/lib/data";
import { DashboardHeader } from "@/components/dashboard/header";
import { PillarCard } from "@/components/dashboard/pillar-card";
import { useLocalStorage, useGarminSync } from "@/lib/storage";
import { calcAllScores } from "@/lib/scores";
import { useEffect } from "react";

export default function Home() {
  // Read persisted data
  const [goals] = useLocalStorage("dashboard_goals", {
    activeCalories: { ...monthlyGoals.activeCalories },
    cycling: { ...monthlyGoals.cycling },
    cyclingHours: { ...monthlyGoals.cyclingHours },
    running: { ...monthlyGoals.running },
    competition: { ...monthlyGoals.competition },
  });
  const [gymMonthlyDone] = useLocalStorage("dashboard_gym_monthly_done", sportAreas[0].current);
  const [gymMonthlyGoal] = useLocalStorage("dashboard_gym_monthly_goal", sportAreas[0].monthlyGoal);
  // Garmin cached data
  const garmin = useGarminSync();

  // Try to load cached garmin data on mount (don't force sync)
  useEffect(() => {
    garmin.sync(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Calculate dynamic pillar scores
  const scores = calcAllScores(garmin.data, goals, gymMonthlyDone, gymMonthlyGoal);

  // Apply scores to pillars
  const dynamicPillars = pillars.map((p) => {
    const s = scores[p.id as keyof typeof scores];
    if (s) return { ...p, score: s.score, trend: s.trend };
    return p;
  });

  const overallScore = Math.round(
    dynamicPillars.reduce((sum, p) => sum + p.score, 0) / dynamicPillars.length
  );

  const onTrack = dynamicPillars.filter((p) => p.score >= 65).length;
  const atRisk = dynamicPillars.filter((p) => p.score >= 40 && p.score < 65).length;
  const offTrack = dynamicPillars.filter((p) => p.score < 40).length;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <DashboardHeader />

        {/* Summary bar */}
        <div className="mt-8 flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary">
              {overallScore}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Ogolny wynik</p>
              <p className="text-xs text-muted-foreground">srednia z {dynamicPillars.length} filarow</p>
            </div>
          </div>
          <div className="ml-auto flex gap-3">
            {onTrack > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                ✓ {onTrack} Na dobrej drodze
              </span>
            )}
            {atRisk > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                ⚠ {atRisk} Wymaga uwagi
              </span>
            )}
            {offTrack > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
                ✗ {offTrack} Ponizej celu
              </span>
            )}
          </div>
        </div>

        {/* Garmin status + quick stats */}
        {garmin.data && (
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
              Garmin zsynchronizowany: {new Date(garmin.data.syncedAt).toLocaleString("pl-PL")}
            </span>
            {garmin.data.summary.month.runningKm > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-green-700">
                🏃 {garmin.data.summary.month.runningKm} km
              </span>
            )}
            {garmin.data.summary.month.cyclingKm > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">
                🚴 {garmin.data.summary.month.cyclingKm} km
              </span>
            )}
            {garmin.data.summary.month.gymSessions > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-purple-700">
                🏋️ {garmin.data.summary.month.gymSessions}x
              </span>
            )}
          </div>
        )}

        {/* Weekly Planner link */}
        <Link
          href="/weekly"
          className="mt-6 flex items-center justify-between rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:shadow-md hover:border-primary/20"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">📋</span>
            <div>
              <p className="text-sm font-semibold text-foreground">Weekly Planner</p>
              <p className="text-xs text-muted-foreground">Zaplanuj zadania na ten tydzien</p>
            </div>
          </div>
          <span className="text-muted-foreground">→</span>
        </Link>

        {/* Pillar cards */}
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {dynamicPillars.map((pillar) => (
            <PillarCard key={pillar.id} pillar={pillar} />
          ))}
        </div>

        {/* Footer quote */}
        <p className="mt-10 text-center text-sm text-muted-foreground italic">
          &ldquo;Dyscyplina to robienie tego, co trzeba, kiedy trzeba, nawet gdy nie chce sie tego robic.&rdquo;
        </p>
      </div>
    </div>
  );
}
