"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type CheckIn = {
  date: string;
  dailyPlan: boolean;
  weeklyReview: boolean;
  notes: string;
};

/** Get all dates from month start to today */
function getMonthDates(): string[] {
  const now = new Date();
  const dates: string[] = [];
  for (let d = 1; d <= now.getDate(); d++) {
    const dt = new Date(now.getFullYear(), now.getMonth(), d);
    dates.push(dt.toISOString().split("T")[0]);
  }
  return dates;
}

/** Get Monday of the week for a given date */
function getWeekStart(d: Date): string {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().split("T")[0];
}

/** Get week starts that fall in this month */
function getMonthWeekStarts(): string[] {
  const monthDates = getMonthDates();
  const weekStarts = new Set<string>();
  for (const ds of monthDates) {
    weekStarts.add(getWeekStart(new Date(ds)));
  }
  return Array.from(weekStarts).sort();
}

const DAY_NAMES = ["Pn", "Wt", "Sr", "Cz", "Pt", "So", "Nd"];

export default function PracaPage() {
  const [checkins, setCheckins] = useState<CheckIn[]>([]);
  const [weeksWithGoals, setWeeksWithGoals] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().split("T")[0];
  const monthDates = getMonthDates();
  const monthWeekStarts = getMonthWeekStarts();

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/praca?days=31");
      const data = await res.json();
      setCheckins(data.checkins || []);
      setWeeksWithGoals(data.weeksWithGoals || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const checkinMap = new Map(checkins.map((c) => [c.date, c]));
  const todayCheckin = checkinMap.get(today);

  // Stats
  const daysWithPlan = monthDates.filter((d) => checkinMap.get(d)?.dailyPlan).length;
  const daysElapsed = monthDates.length;
  const planPct = daysElapsed > 0 ? Math.round((daysWithPlan / daysElapsed) * 100) : 0;

  const weeksReviewed = monthWeekStarts.filter((ws) => weeksWithGoals.includes(ws)).length;
  const weeksElapsed = monthWeekStarts.length;
  const weeksPct = weeksElapsed > 0 ? Math.round((weeksReviewed / weeksElapsed) * 100) : 0;

  const overallScore = Math.round((planPct + weeksPct) / 2);

  async function toggleDailyPlan() {
    const newVal = !todayCheckin?.dailyPlan;
    const updated: CheckIn = {
      date: today,
      dailyPlan: newVal,
      weeklyReview: todayCheckin?.weeklyReview ?? false,
      notes: todayCheckin?.notes ?? "",
    };
    setCheckins((prev) => {
      const without = prev.filter((c) => c.date !== today);
      return [updated, ...without];
    });

    await fetch("/api/praca", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: today, dailyPlan: newVal }),
    });
  }

  async function toggleWeeklyReview() {
    const newVal = !todayCheckin?.weeklyReview;
    const updated: CheckIn = {
      date: today,
      dailyPlan: todayCheckin?.dailyPlan ?? false,
      weeklyReview: newVal,
      notes: todayCheckin?.notes ?? "",
    };
    setCheckins((prev) => {
      const without = prev.filter((c) => c.date !== today);
      return [updated, ...without];
    });

    await fetch("/api/praca", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: today, weeklyReview: newVal }),
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Ladowanie...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
            ← Dashboard
          </Link>
          <Link
            href="/weekly"
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Weekly Planner
          </Link>
        </div>

        <h1 className="mt-6 text-2xl font-bold text-foreground flex items-center gap-2">
          💼 Praca
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Mierz skutecznosc pracy: plan dnia + cele tygodniowe
        </p>

        {/* Overall score */}
        <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div
              className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-2xl font-bold ${
                overallScore >= 65
                  ? "bg-green-100 text-green-700"
                  : overallScore >= 40
                    ? "bg-amber-100 text-amber-700"
                    : overallScore > 0
                      ? "bg-red-100 text-red-700"
                      : "bg-muted text-muted-foreground"
              }`}
            >
              {overallScore}
            </div>
            <div>
              <p className="text-lg font-semibold text-foreground">Wynik Praca</p>
              <p className="text-sm text-muted-foreground">
                Srednia: plan dnia ({planPct}%) + cele tygodniowe ({weeksPct}%)
              </p>
            </div>
          </div>

          {/* Progress bars */}
          <div className="mt-4 space-y-3">
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">📋 Plan dnia</span>
                <span className="font-medium">{daysWithPlan} / {daysElapsed} dni</span>
              </div>
              <div className="mt-1 h-2.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${planPct}%`,
                    backgroundColor: planPct >= 65 ? "#22c55e" : planPct >= 40 ? "#f59e0b" : "#ef4444",
                  }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">🎯 Cele tygodniowe</span>
                <span className="font-medium">{weeksReviewed} / {weeksElapsed} tyg</span>
              </div>
              <div className="mt-1 h-2.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${weeksPct}%`,
                    backgroundColor: weeksPct >= 65 ? "#22c55e" : weeksPct >= 40 ? "#f59e0b" : "#ef4444",
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Today's check-in */}
        <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Dzisiaj</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" })}
          </p>

          <div className="mt-4 space-y-3">
            <button
              onClick={toggleDailyPlan}
              className={`w-full flex items-center gap-3 rounded-xl border p-4 text-left transition-all ${
                todayCheckin?.dailyPlan
                  ? "border-green-300 bg-green-50 text-green-800"
                  : "border-border bg-background hover:bg-muted/50 text-foreground"
              }`}
            >
              <span className="text-2xl">{todayCheckin?.dailyPlan ? "✅" : "⬜"}</span>
              <div>
                <p className="font-medium">Zrobilem plan dnia</p>
                <p className="text-xs opacity-70">Zaplanowałem co dzis zrobie — priorytety, zadania</p>
              </div>
            </button>

            <button
              onClick={toggleWeeklyReview}
              className={`w-full flex items-center gap-3 rounded-xl border p-4 text-left transition-all ${
                todayCheckin?.weeklyReview
                  ? "border-blue-300 bg-blue-50 text-blue-800"
                  : "border-border bg-background hover:bg-muted/50 text-foreground"
              }`}
            >
              <span className="text-2xl">{todayCheckin?.weeklyReview ? "✅" : "⬜"}</span>
              <div>
                <p className="font-medium">Zrewidowalem cele tygodniowe</p>
                <p className="text-xs opacity-70">Wpisalem/sprawdzilem cele w Weekly Planner</p>
              </div>
            </button>
          </div>
        </div>

        {/* Calendar view — this month */}
        <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">
            {new Date().toLocaleDateString("pl-PL", { month: "long", year: "numeric" })}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Historia check-inow</p>

          {/* Legend */}
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-green-400" /> Plan dnia</span>
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-blue-400" /> Cele tyg.</span>
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-red-100" /> Brak</span>
          </div>

          {/* Calendar grid */}
          <div className="mt-3 grid grid-cols-7 gap-1">
            {DAY_NAMES.map((d) => (
              <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">
                {d}
              </div>
            ))}
            {/* Offset for first day of month (Monday=0) */}
            {Array.from({ length: (new Date(new Date().getFullYear(), new Date().getMonth(), 1).getDay() + 6) % 7 }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {monthDates.map((ds) => {
              const ci = checkinMap.get(ds);
              const dayNum = parseInt(ds.split("-")[2]);
              const isToday = ds === today;
              const hasPlan = ci?.dailyPlan;
              const hasReview = ci?.weeklyReview;

              let bg = "bg-muted/40";
              if (hasPlan && hasReview) bg = "bg-gradient-to-br from-green-400 to-blue-400";
              else if (hasPlan) bg = "bg-green-400";
              else if (hasReview) bg = "bg-blue-400";
              else if (ds < today) bg = "bg-red-100";

              return (
                <div
                  key={ds}
                  className={`relative flex items-center justify-center rounded-md h-9 text-xs font-medium transition-all ${bg} ${
                    isToday ? "ring-2 ring-primary ring-offset-1" : ""
                  } ${hasPlan || hasReview ? "text-white" : "text-muted-foreground"}`}
                >
                  {dayNum}
                </div>
              );
            })}
          </div>
        </div>

        {/* Weekly goals auto-detection hint */}
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-muted/30 p-5">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            🎯 Cele tygodniowe — automatyczne wykrywanie
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            System automatycznie sprawdza czy w danym tygodniu masz wpisane cele w Weekly Planner.
            Jesli masz cele na dany tydzien — ten tydzien liczy sie jako &quot;zrewidowany&quot;.
            Dodatkowo mozesz recznie odhaczyc rewizje przyciskiem powyzej.
          </p>
          <Link
            href="/weekly"
            className="mt-3 inline-flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20 transition-colors"
          >
            📋 Otworz Weekly Planner →
          </Link>
        </div>

        {/* How scoring works */}
        <details className="mt-6 mb-8">
          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors">
            Jak liczone?
          </summary>
          <div className="mt-2 rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground space-y-1.5">
            <p><span className="font-medium text-foreground">Plan dnia:</span> ile dni w miesiacu odhaczyłes &quot;zrobilem plan dnia&quot; / dni ktore minęły</p>
            <p><span className="font-medium text-foreground">Cele tygodniowe:</span> ile tygodni ma wpisane cele w Weekly Planner / tygodnie ktore minęły</p>
            <p><span className="font-medium text-foreground">Wynik:</span> srednia obu metryk (0–100)</p>
            <p className="pt-1 border-t border-border">
              <span className="text-green-600 font-medium">65+</span> super ·
              <span className="text-amber-600 font-medium"> 40–64</span> moze byc ·
              <span className="text-red-600 font-medium"> &lt;40</span> trzeba popracowac
            </p>
          </div>
        </details>
      </div>
    </div>
  );
}
