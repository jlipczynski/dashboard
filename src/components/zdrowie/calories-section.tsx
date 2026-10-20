"use client";

import { useCallback, useEffect, useState } from "react";
import { addDays, toDateStr, weekStartStr, type RehabPlan } from "@/lib/rehab";
import {
  CALORIE_DAILY_LIMIT,
  CALORIE_PENALTY_PER_PCT,
  calorieWeekScore,
  type CalorieEntry,
} from "@/lib/calories";

const DAY_LABELS = ["Pn", "Wt", "Śr", "Cz", "Pt", "Sb", "Nd"];
const fmt = (n: number) => n.toLocaleString("pl-PL");

function fmtDay(s: string): string {
  const [, m, d] = s.split("-");
  return `${d}.${m}`;
}

export function CaloriesSection({
  plan,
  onEntriesChange,
}: {
  plan: RehabPlan;
  onEntriesChange?: (entries: CalorieEntry[]) => void;
}) {
  const today = toDateStr(new Date());
  const weekStart = weekStartStr(today);
  const weekEnd = addDays(weekStart, 6);
  const [entries, setEntries] = useState<CalorieEntry[]>([]);
  const [selected, setSelected] = useState(today);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/calories?from=${plan.start}&to=${plan.end}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.entries) setEntries(d.entries);
      })
      .catch(() => {});
  }, [plan.start, plan.end]);

  useEffect(() => {
    onEntriesChange?.(entries);
  }, [entries, onEntriesChange]);

  const selectedEntry = entries.find((e) => e.date === selected);
  useEffect(() => {
    setDraft(selectedEntry ? String(selectedEntry.calories) : "");
  }, [selected, selectedEntry]);

  const save = useCallback(async () => {
    const calories = parseInt(draft);
    if (!Number.isInteger(calories) || calories < 0) return;
    setSaving(true);
    setError(null);
    const prev = entries;
    setEntries((list) => [...list.filter((e) => e.date !== selected), { date: selected, calories }]);
    try {
      const res = await fetch("/api/calories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selected, calories }),
      });
      const d = await res.json();
      if (!res.ok || d.error) throw new Error(d.error || "Błąd zapisu");
    } catch (err) {
      setEntries(prev);
      setError(err instanceof Error ? err.message : "Błąd zapisu");
    }
    setSaving(false);
  }, [draft, entries, selected]);

  const weekFrom = weekStart > plan.start ? weekStart : plan.start;
  const week = calorieWeekScore(entries, weekFrom, weekEnd, today);
  const byDate = new Map(entries.map((e) => [e.date, e.calories]));
  const weekDays = DAY_LABELS.map((_, i) => addDays(weekStart, i));
  const selectable = (d: string) => d >= plan.start && d <= today;
  const left = week ? week.budget - week.consumed : 0;

  return (
    <div className="mt-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🍽</span>
          <div>
            <h4 className="font-semibold text-foreground">Kalorie <span className="text-xs font-normal text-muted-foreground">· WIG 2 · waga 30%</span></h4>
            <p className="text-xs text-muted-foreground">
              Cel: max {fmt(CALORIE_DAILY_LIMIT)} kcal dziennie — liczy się bilans tygodnia
            </p>
          </div>
        </div>
        {week && (
          <span
            className="rounded-full px-2.5 py-1 text-xs font-semibold text-white tabular-nums"
            style={{ backgroundColor: week.score >= 85 ? "#22c55e" : week.score >= 50 ? "#f59e0b" : "#ef4444" }}
          >
            Tydzień: {week.score}%
          </span>
        )}
      </div>

      {/* Lead: daily entry */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="mt-4 flex flex-wrap items-center gap-2"
      >
        <span className="text-sm text-foreground">
          {selected === today ? "Dziś" : fmtDay(selected)} zjedzone:
        </span>
        <input
          type="number"
          min={0}
          max={10000}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="kcal"
          className="w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
        />
        <span className="text-sm text-muted-foreground">kcal</span>
        <button
          type="submit"
          disabled={saving || draft === ""}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          Zapisz
        </button>
        {saving && <span className="text-xs text-blue-500">Zapisuję...</span>}
        {error && <span className="text-xs text-red-500">{error}</span>}
      </form>

      {/* Week strip */}
      <div className="mt-4 flex gap-1">
        {weekDays.map((d, i) => {
          const kcal = byDate.get(d);
          const missing = kcal === undefined && d < today && d >= plan.start;
          return (
            <button
              key={d}
              onClick={() => selectable(d) && setSelected(d)}
              disabled={!selectable(d)}
              className={`flex flex-1 flex-col items-center gap-1 rounded-lg py-1.5 transition-all disabled:opacity-40 ${
                d === selected ? "ring-2 ring-foreground/30" : ""
              }`}
            >
              <span className="text-[10px] text-muted-foreground">{DAY_LABELS[i]}</span>
              <span
                className="flex h-9 w-full max-w-[52px] items-center justify-center rounded-md text-[11px] font-semibold tabular-nums"
                style={{
                  backgroundColor:
                    kcal === undefined ? (missing ? "#fecaca" : "#e5e7eb") : kcal <= CALORIE_DAILY_LIMIT ? "#22c55e" : "#ef4444",
                  color: kcal === undefined ? "#6b7280" : "#fff",
                }}
              >
                {kcal === undefined ? (missing ? "brak" : "—") : fmt(kcal)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Lag: weekly balance */}
      {week ? (
        <div className="mt-4 rounded-lg bg-muted/50 px-3 py-2 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-foreground">
              Bilans tygodnia: <span className="font-semibold tabular-nums">{fmt(week.consumed)}</span> / {fmt(week.budget)} kcal
            </span>
            <span className={`text-xs font-medium ${left >= 0 ? "text-green-700" : "text-red-600"}`}>
              {left >= 0 ? `zapas ${fmt(left)} kcal` : `ponad budżet o ${fmt(-left)} kcal`}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            Budżet = {fmt(CALORIE_DAILY_LIMIT)} × {week.daysLogged} wpisanych dni
          </div>

          {/* Penalties — always explained */}
          <div className="mt-2 space-y-1 text-xs">
            {week.penalty > 0 && (
              <p className="text-red-600">
                ⚠ Kara za przekroczenie: budżet przekroczony o {week.overPct}% ({fmt(week.overKcal)} kcal) → −{week.penalty} pkt
                <span className="text-muted-foreground"> ({CALORIE_PENALTY_PER_PCT} pkt za każdy 1% ponad budżet)</span>
              </p>
            )}
            {week.missingDates.length > 0 && (
              <p className="text-red-600">
                ⚠ Kara za brak wpisów: {week.missingDates.length} z {week.daysElapsed} dni bez wpisu
                ({week.missingDates.map(fmtDay).join(", ")}) → wynik × {Math.round(week.loggingFactor * 100)}%
              </p>
            )}
            {week.penalty === 0 && week.missingDates.length === 0 && (
              <p className="text-green-700">✓ Bez kar — bilans w budżecie i wszystkie dni wpisane</p>
            )}
            {(week.penalty > 0 || week.missingDates.length > 0) && (
              <p className="text-muted-foreground">
                Wynik: {week.balanceScore} pkt{week.missingDates.length > 0 && ` × ${Math.round(week.loggingFactor * 100)}%`} = {week.score}%
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">Wpisz dzisiejsze kalorie, aby zacząć liczyć bilans tygodnia.</p>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">Jak liczone?</summary>
        <div className="mt-2 space-y-1 rounded-lg bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
          <p>Budżet tygodnia = {fmt(CALORIE_DAILY_LIMIT)} kcal × liczba wpisanych dni. Nadwyżkę jednego dnia możesz wyrównać innym dniem.</p>
          <p>W budżecie = 100%. Kara: −{CALORIE_PENALTY_PER_PCT} pkt za każdy 1% ponad budżet (20% ponad = 0%).</p>
          <p>Dzień bez wpisu obniża wynik proporcjonalnie (np. 5 z 6 dni wpisanych → wynik × 83%). Dzisiejszy dzień liczy się po wpisaniu.</p>
          <p>Wynik miesięczny (strona główna) = średnia z wyników tygodni w tym miesiącu.</p>
        </div>
      </details>
    </div>
  );
}
