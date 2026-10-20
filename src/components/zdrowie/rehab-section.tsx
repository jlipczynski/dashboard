"use client";

import { useCallback, useEffect, useState } from "react";
import {
  addDays,
  rehabStats,
  toDateStr,
  weekStartStr,
  type RehabEntry,
  type RehabPlan,
} from "@/lib/rehab";

const DAY_LABELS = ["Pn", "Wt", "Śr", "Cz", "Pt", "Sb", "Nd"];
const QUICK = [0, 25, 50, 75, 100];

function pctColor(p: number | null | undefined, target: number): string {
  if (p === null || p === undefined) return "#e5e7eb";
  if (p >= target) return "#22c55e";
  if (p >= 50) return "#f59e0b";
  return "#ef4444";
}

function fmtDate(s: string): string {
  const [y, m, d] = s.split("-");
  return `${d}.${m}.${y}`;
}

function Stat({ label, value, suffix = "%" }: { label: string; value: number | null; suffix?: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2 text-center">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold text-foreground tabular-nums">
        {value === null ? "—" : `${value}${suffix}`}
      </div>
    </div>
  );
}

export function RehabSection({
  plan,
  onEndPlan,
  onEntriesChange,
}: {
  plan: RehabPlan;
  onEndPlan: () => void;
  onEntriesChange?: (entries: RehabEntry[]) => void;
}) {
  const today = toDateStr(new Date());
  const [entries, setEntries] = useState<RehabEntry[]>([]);
  const [selected, setSelected] = useState(today < plan.start ? plan.start : today);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);

  useEffect(() => {
    fetch(`/api/rehab?from=${plan.start}&to=${plan.end}`)
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
    setDraft(selectedEntry ? String(selectedEntry.percent) : "");
  }, [selected, selectedEntry]);

  const save = useCallback(
    async (percent: number) => {
      if (!Number.isInteger(percent) || percent < 0 || percent > 100) return;
      setSaving(true);
      setError(null);
      const prev = entries;
      setEntries((list) => [...list.filter((e) => e.date !== selected), { date: selected, percent }]);
      try {
        const res = await fetch("/api/rehab", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: selected, percent }),
        });
        const d = await res.json();
        if (!res.ok || d.error) throw new Error(d.error || "Błąd zapisu");
      } catch (err) {
        setEntries(prev);
        setError(err instanceof Error ? err.message : "Błąd zapisu");
      }
      setSaving(false);
    },
    [entries, selected]
  );

  const stats = rehabStats(plan, entries, today);
  const byDate = new Map(entries.map((e) => [e.date, e.percent]));
  const weekStart = weekStartStr(today);
  const weekDays = DAY_LABELS.map((_, i) => addDays(weekStart, i));
  const planDates: string[] = [];
  for (let d = plan.start; d <= plan.end; d = addDays(d, 1)) planDates.push(d);
  const selectable = (d: string) => d >= plan.start && d <= plan.end && d <= today;

  return (
    <div className="mt-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🩺</span>
          <div>
            <h4 className="font-semibold text-foreground">Rehabilitacja <span className="text-xs font-normal text-muted-foreground">· WIG 1 · waga 70%</span></h4>
            <p className="text-xs text-muted-foreground">
              Cel: {plan.target}% zaleceń codziennie · {fmtDate(plan.start)} – {fmtDate(plan.end)}
            </p>
          </div>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground tabular-nums">
          Dzień {stats.dayOfPlan} / {stats.planDays}
        </span>
      </div>

      {/* Entry for selected day */}
      <div className="mt-4">
        <div className="text-sm text-foreground">
          {selected === today ? "Dzisiaj" : fmtDate(selected)} — wykonanie zaleceń:
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {QUICK.map((q) => (
            <button
              key={q}
              onClick={() => save(q)}
              disabled={saving}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-all disabled:opacity-50 ${
                selectedEntry?.percent === q
                  ? "border-transparent text-white"
                  : "border-border bg-background text-foreground hover:bg-muted"
              }`}
              style={selectedEntry?.percent === q ? { backgroundColor: pctColor(q, plan.target) } : undefined}
            >
              {q}%
            </button>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save(parseInt(draft));
            }}
            className="flex items-center gap-1"
          >
            <input
              type="number"
              min={0}
              max={100}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="inne"
              className="w-16 rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
            />
            <button
              type="submit"
              disabled={saving || draft === ""}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
            >
              ✓
            </button>
          </form>
          {saving && <span className="text-xs text-blue-500">Zapisuję...</span>}
          {error && <span className="text-xs text-red-500">{error}</span>}
        </div>
      </div>

      {/* Current week */}
      <div className="mt-4 flex gap-1">
        {weekDays.map((d, i) => {
          const p = byDate.get(d);
          const isSel = d === selected;
          return (
            <button
              key={d}
              onClick={() => selectable(d) && setSelected(d)}
              disabled={!selectable(d)}
              className={`flex flex-1 flex-col items-center gap-1 rounded-lg py-1.5 transition-all disabled:opacity-40 ${
                isSel ? "ring-2 ring-foreground/30" : ""
              }`}
            >
              <span className="text-[10px] text-muted-foreground">{DAY_LABELS[i]}</span>
              <span
                className="flex h-9 w-full max-w-[44px] items-center justify-center rounded-md text-xs font-semibold tabular-nums"
                style={{
                  backgroundColor: pctColor(p, plan.target),
                  color: p === undefined ? "#6b7280" : "#fff",
                }}
              >
                {p === undefined ? "—" : `${p}`}
              </span>
            </button>
          );
        })}
      </div>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Dziś" value={stats.today} />
        <Stat label="Tydzień" value={stats.week} />
        <Stat label="Miesiąc" value={stats.month} />
        <Stat label="Cały plan" value={stats.plan} />
        <Stat label={`Seria ${plan.target}%`} value={stats.streak} suffix=" dni" />
      </div>

      {/* Whole plan overview */}
      <div className="mt-4">
        <div className="text-[11px] text-muted-foreground">Cały plan (kliknij dzień, aby poprawić)</div>
        <div className="mt-1.5 flex flex-wrap gap-[3px]">
          {planDates.map((d) => (
            <button
              key={d}
              title={`${fmtDate(d)}: ${byDate.has(d) ? `${byDate.get(d)}%` : "brak"}`}
              onClick={() => selectable(d) && setSelected(d)}
              disabled={!selectable(d)}
              className={`h-3 w-3 rounded-[2px] ${d === selected ? "ring-1 ring-foreground" : ""}`}
              style={{
                backgroundColor: byDate.has(d)
                  ? pctColor(byDate.get(d), plan.target)
                  : d < today
                    ? "#fecaca"
                    : "#f3f4f6",
              }}
            />
          ))}
        </div>
      </div>

      {/* End rehab mode */}
      <div className="mt-4 border-t border-border pt-3 text-xs">
        {confirmEnd ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Zakończyć rehabilitację i przywrócić cele sportowe?</span>
            <button
              onClick={onEndPlan}
              className="rounded-md bg-foreground px-2 py-1 font-medium text-background"
            >
              Tak, zakończ
            </button>
            <button onClick={() => setConfirmEnd(false)} className="text-muted-foreground hover:text-foreground">
              Anuluj
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmEnd(true)} className="text-muted-foreground hover:text-foreground">
            Zakończ tryb rehabilitacji (przywróć cele sportowe)
          </button>
        )}
      </div>
    </div>
  );
}
