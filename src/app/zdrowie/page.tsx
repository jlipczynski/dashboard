"use client";

import { useState } from "react";
import { BackButton } from "@/components/dashboard/back-button";
import { monthlyGoals, sportAreas } from "@/lib/data";

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

function ProgressRing({ value, max, color, size = 80 }: { value: number; max: number; color: string; size?: number }) {
  const pct = Math.min(value / max, 1);
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - pct * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f3f4f6" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000"
        />
      </svg>
      <span className="absolute text-sm font-bold" style={{ color }}>
        {Math.round(pct * 100)}%
      </span>
    </div>
  );
}

function MonthlyGoalCard({
  icon,
  label,
  current,
  target,
  unit,
  color,
}: {
  icon: string;
  label: string;
  current: number;
  target: number;
  unit: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <span className="text-sm font-medium text-foreground">{label}</span>
        </div>
        <ProgressRing value={current} max={target} color={color} size={56} />
      </div>
      <div className="mt-3">
        <ProgressBar value={current} max={target} color={color} />
        <p className="mt-1.5 text-xs text-muted-foreground">
          {current} / {target} {unit}
        </p>
      </div>
    </div>
  );
}

function SportCard({ area }: { area: typeof sportAreas[number] }) {
  const [days, setDays] = useState(area.weekDays);
  const dayLabels = ["Pn", "Wt", "Śr", "Cz", "Pt", "Sb", "Nd"];
  const activeDays = days.filter(Boolean).length;

  const toggleDay = (i: number) => {
    const next = [...days];
    next[i] = !next[i];
    setDays(next);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{area.icon}</span>
          <div>
            <h4 className="font-semibold text-foreground">{area.name}</h4>
            <p className="text-xs text-muted-foreground">
              Cel: {area.weeklyGoal} {area.unit}/tydzień · {area.monthlyGoal} {area.unit}/miesiąc
            </p>
          </div>
        </div>
        <ProgressRing value={area.current} max={area.monthlyGoal} color="#22c55e" />
      </div>

      {/* Weekly grid */}
      <div className="mt-4 flex gap-1.5">
        {dayLabels.map((label, i) => (
          <button
            key={label}
            onClick={() => toggleDay(i)}
            className={`flex h-10 w-full flex-col items-center justify-center rounded-lg text-xs font-medium transition-all ${
              days[i]
                ? "bg-green-500 text-white shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {label}
            {days[i] && <span className="text-[10px]">✓</span>}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {activeDays} / 7 dni w tym tygodniu
      </p>
    </div>
  );
}

function CalorieBalance() {
  const weekData = [
    { day: "Pn", balance: -350 },
    { day: "Wt", balance: -200 },
    { day: "Śr", balance: 150 },
    { day: "Cz", balance: -400 },
    { day: "Pt", balance: -100 },
    { day: "Sb", balance: 300 },
    { day: "Nd", balance: -250 },
  ];

  const weekTotal = weekData.reduce((s, d) => s + d.balance, 0);
  const maxAbs = Math.max(...weekData.map((d) => Math.abs(d.balance)));

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h4 className="flex items-center gap-2 font-semibold text-foreground">
        🔥 Bilans Kaloryczny — Tydzień
      </h4>
      <p className="mt-1 text-xs text-muted-foreground">
        Tylko aktywne kalorie · Źródło: Garmin / MyFitnessPal
      </p>

      <div className="mt-4 space-y-2">
        {weekData.map((d) => {
          const pct = (Math.abs(d.balance) / maxAbs) * 100;
          const isDeficit = d.balance <= 0;
          return (
            <div key={d.day} className="flex items-center gap-3">
              <span className="w-6 text-xs font-medium text-muted-foreground">{d.day}</span>
              <div className="flex h-5 flex-1 items-center">
                {isDeficit ? (
                  <div className="flex h-full w-full justify-end">
                    <div
                      className="h-full rounded-l-full bg-green-400"
                      style={{ width: `${pct / 2}%` }}
                    />
                  </div>
                ) : (
                  <div className="flex h-full w-full">
                    <div className="w-1/2" />
                    <div
                      className="h-full rounded-r-full bg-orange-400"
                      style={{ width: `${pct / 2}%` }}
                    />
                  </div>
                )}
              </div>
              <span
                className={`w-16 text-right text-xs font-medium ${
                  isDeficit ? "text-green-600" : "text-orange-500"
                }`}
              >
                {d.balance > 0 ? "+" : ""}
                {d.balance} kcal
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-lg bg-muted px-4 py-2">
        <span className="text-sm font-medium">Suma tygodnia</span>
        <span
          className={`text-sm font-bold ${weekTotal <= 0 ? "text-green-600" : "text-orange-500"}`}
        >
          {weekTotal > 0 ? "+" : ""}
          {weekTotal} kcal
        </span>
      </div>
    </div>
  );
}

export default function ZdrowiePage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <BackButton />

        <div className="mt-4 flex items-center gap-3">
          <span className="text-3xl">❤️</span>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Zdrowie i Fitness</h1>
            <p className="text-muted-foreground">Marzec 2026 — cele i postępy</p>
          </div>
        </div>

        {/* Monthly goals */}
        <h3 className="mt-8 text-lg font-semibold text-foreground">🎯 Cele Miesięczne</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MonthlyGoalCard
            icon="🔥"
            label="Aktywne kalorie"
            current={monthlyGoals.activeCalories.current}
            target={monthlyGoals.activeCalories.target}
            unit="kcal"
            color="#ef4444"
          />
          <MonthlyGoalCard
            icon="🚴"
            label="Rower (km)"
            current={monthlyGoals.cycling.current}
            target={monthlyGoals.cycling.target}
            unit="km"
            color="#3b82f6"
          />
          <MonthlyGoalCard
            icon="🕐"
            label="Rower (godziny)"
            current={monthlyGoals.cyclingHours.current}
            target={monthlyGoals.cyclingHours.target}
            unit="h"
            color="#6366f1"
          />
          <MonthlyGoalCard
            icon="🏃"
            label="Bieganie"
            current={monthlyGoals.running.current}
            target={monthlyGoals.running.target}
            unit="km"
            color="#22c55e"
          />
        </div>

        {/* Competition */}
        <div className="mt-4 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏆</span>
            <div>
              <h4 className="font-semibold text-foreground">Najbliższe zawody</h4>
              <p className="text-sm text-muted-foreground">
                {monthlyGoals.competition.name} — {monthlyGoals.competition.date}
              </p>
            </div>
          </div>
        </div>

        {/* Sport areas */}
        <h3 className="mt-8 text-lg font-semibold text-foreground">🏅 Obszary Sportowe</h3>
        <div className="mt-3 grid gap-4">
          {sportAreas.map((area) => (
            <SportCard key={area.name} area={area} />
          ))}
        </div>

        {/* Calorie balance */}
        <h3 className="mt-8 text-lg font-semibold text-foreground">📊 Bilans Kaloryczny</h3>
        <div className="mt-3">
          <CalorieBalance />
        </div>
      </div>
    </div>
  );
}
