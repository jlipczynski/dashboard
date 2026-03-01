"use client";

import { useState } from "react";
import { BackButton } from "@/components/dashboard/back-button";
import { monthlyGoals, sportAreas } from "@/lib/data";

/* ── Editable number field ──────────────────────────────────── */
function EditableNumber({
  value,
  onSave,
  unit,
  className = "",
}: {
  value: number;
  onSave: (v: number) => void;
  unit: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  if (editing) {
    return (
      <form
        className="inline-flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          const n = parseFloat(draft);
          if (!isNaN(n) && n >= 0) onSave(n);
          setEditing(false);
        }}
      >
        <input
          autoFocus
          type="number"
          min={0}
          step="any"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const n = parseFloat(draft);
            if (!isNaN(n) && n >= 0) onSave(n);
            setEditing(false);
          }}
          className="w-20 rounded border border-border bg-background px-2 py-0.5 text-sm"
        />
        <span className="text-xs text-muted-foreground">{unit}</span>
      </form>
    );
  }

  return (
    <button
      onClick={() => {
        setDraft(String(value));
        setEditing(true);
      }}
      className={`group inline-flex items-baseline gap-1 rounded px-1 py-0.5 hover:bg-muted/60 ${className}`}
      title="Kliknij, aby edytować"
    >
      <span className="font-bold">{value}</span>
      <span className="text-xs text-muted-foreground">{unit}</span>
      <span className="text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
        &#9998;
      </span>
    </button>
  );
}

/* ── Editable text field ────────────────────────────────────── */
function EditableText({
  value,
  onSave,
  className = "",
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    return (
      <form
        className="inline-flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) onSave(draft.trim());
          setEditing(false);
        }}
      >
        <input
          autoFocus
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft.trim()) onSave(draft.trim());
            setEditing(false);
          }}
          className="w-48 rounded border border-border bg-background px-2 py-0.5 text-sm"
        />
      </form>
    );
  }

  return (
    <button
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className={`group inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted/60 ${className}`}
      title="Kliknij, aby edytować"
    >
      <span>{value}</span>
      <span className="text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
        &#9998;
      </span>
    </button>
  );
}

/* ── Progress ring ──────────────────────────────────────────── */
function ProgressRing({
  value,
  max,
  color,
  size = 80,
}: {
  value: number;
  max: number;
  color: string;
  size?: number;
}) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
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

/* ── Progress bar ───────────────────────────────────────────── */
function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

/* ── Mountain progress chart ────────────────────────────────── */
function MountainProgress({
  current,
  target,
  weeklyEntries,
  color,
  unit,
  label,
}: {
  current: number;
  target: number;
  weeklyEntries: number[];
  color: string;
  unit: string;
  label: string;
}) {
  const w = 320;
  const h = 140;
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  const dayLabels = ["Pn", "Wt", "Sr", "Cz", "Pt", "Sb", "Nd"];
  const cumulative: number[] = [];
  let sum = 0;
  for (const e of weeklyEntries) {
    sum += e;
    cumulative.push(sum);
  }

  const maxY = Math.max(target, sum, 1);

  const points = cumulative.map((val, i) => {
    const x = padding.left + (i / 6) * chartW;
    const y = padding.top + chartH - (val / maxY) * chartH;
    return { x, y };
  });

  const targetY = padding.top + chartH - (target / maxY) * chartH;

  // Build area path (filled below line)
  const areaPath =
    points.length > 0
      ? `M${padding.left},${padding.top + chartH} ` +
        points.map((p) => `L${p.x},${p.y}`).join(" ") +
        ` L${points[points.length - 1].x},${padding.top + chartH} Z`
      : "";

  const linePath =
    points.length > 0 ? points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") : "";

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-2 font-semibold text-foreground">{label}</h4>
        <span className="text-sm font-bold" style={{ color }}>
          {current} / {target} {unit}
        </span>
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 w-full" style={{ maxWidth: w }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const y = padding.top + chartH - frac * chartH;
          return (
            <g key={frac}>
              <line x1={padding.left} y1={y} x2={w - padding.right} y2={y} stroke="#e5e7eb" strokeWidth={0.5} />
              <text x={padding.left - 4} y={y + 3} textAnchor="end" className="fill-muted-foreground" fontSize={8}>
                {Math.round(frac * maxY)}
              </text>
            </g>
          );
        })}

        {/* Target line */}
        <line
          x1={padding.left}
          y1={targetY}
          x2={w - padding.right}
          y2={targetY}
          stroke={color}
          strokeWidth={1}
          strokeDasharray="4 3"
          opacity={0.5}
        />
        <text x={w - padding.right + 2} y={targetY + 3} fontSize={7} className="fill-muted-foreground">
          cel
        </text>

        {/* Area fill */}
        {areaPath && <path d={areaPath} fill={color} opacity={0.15} />}

        {/* Line */}
        {linePath && <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}

        {/* Data points */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill={color} />
        ))}

        {/* X-axis labels */}
        {dayLabels.map((label, i) => {
          const x = padding.left + (i / 6) * chartW;
          return (
            <text key={label} x={x} y={h - 5} textAnchor="middle" className="fill-muted-foreground" fontSize={8}>
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/* ── Monthly goal card (editable) ───────────────────────────── */
function MonthlyGoalCard({
  icon,
  label,
  current,
  target,
  unit,
  color,
  onCurrentChange,
  onTargetChange,
}: {
  icon: string;
  label: string;
  current: number;
  target: number;
  unit: string;
  color: string;
  onCurrentChange: (v: number) => void;
  onTargetChange: (v: number) => void;
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
        <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
          <EditableNumber value={current} onSave={onCurrentChange} unit="" className="text-xs" />
          <span>/</span>
          <EditableNumber value={target} onSave={onTargetChange} unit={unit} className="text-xs" />
        </div>
      </div>
    </div>
  );
}

/* ── Gym tracker (check days + monthly count) ───────────────── */
function GymTracker({
  weekDays,
  onToggleDay,
  weeklyGoal,
  monthlyGoal,
  monthlyDone,
  onWeeklyGoalChange,
  onMonthlyGoalChange,
  onMonthlyDoneChange,
}: {
  weekDays: boolean[];
  onToggleDay: (i: number) => void;
  weeklyGoal: number;
  monthlyGoal: number;
  monthlyDone: number;
  onWeeklyGoalChange: (v: number) => void;
  onMonthlyGoalChange: (v: number) => void;
  onMonthlyDoneChange: (v: number) => void;
}) {
  const dayLabels = ["Pn", "Wt", "Sr", "Cz", "Pt", "Sb", "Nd"];
  const activeDays = weekDays.filter(Boolean).length;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏋️</span>
          <div>
            <h4 className="font-semibold text-foreground">Silownia</h4>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Cel:</span>
              <EditableNumber value={weeklyGoal} onSave={onWeeklyGoalChange} unit="x/tydz" className="text-xs" />
              <span>|</span>
              <EditableNumber value={monthlyGoal} onSave={onMonthlyGoalChange} unit="x/mies" className="text-xs" />
            </div>
          </div>
        </div>
        <ProgressRing value={monthlyDone} max={monthlyGoal} color="#22c55e" />
      </div>

      {/* Weekly grid */}
      <div className="mt-4 flex gap-1.5">
        {dayLabels.map((label, i) => (
          <button
            key={label}
            onClick={() => onToggleDay(i)}
            className={`flex h-10 w-full flex-col items-center justify-center rounded-lg text-xs font-medium transition-all ${
              weekDays[i]
                ? "bg-green-500 text-white shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {label}
            {weekDays[i] && <span className="text-[10px]">&#10003;</span>}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {activeDays} / {weeklyGoal} ten tydzien
        </span>
        <div className="flex items-center gap-1">
          <span>Miesiac:</span>
          <EditableNumber value={monthlyDone} onSave={onMonthlyDoneChange} unit={`/ ${monthlyGoal}`} className="text-xs" />
        </div>
      </div>

      {/* Monthly bar */}
      <div className="mt-3">
        <ProgressBar value={monthlyDone} max={monthlyGoal} color="#22c55e" />
      </div>
    </div>
  );
}

/* ── Competition card (editable) ────────────────────────────── */
function CompetitionCard({
  name,
  date,
  onNameChange,
  onDateChange,
}: {
  name: string;
  date: string;
  onNameChange: (v: string) => void;
  onDateChange: (v: string) => void;
}) {
  const [editingDate, setEditingDate] = useState(false);
  const [draftDate, setDraftDate] = useState(date);

  const today = new Date();
  const compDate = new Date(date);
  const diffDays = Math.ceil((compDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="text-2xl">🏆</span>
        <div className="flex-1">
          <h4 className="font-semibold text-foreground">Najblizsze zawody</h4>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <EditableText value={name} onSave={onNameChange} className="text-sm text-muted-foreground" />
            <span className="text-muted-foreground">|</span>
            {editingDate ? (
              <input
                autoFocus
                type="date"
                value={draftDate}
                onChange={(e) => setDraftDate(e.target.value)}
                onBlur={() => {
                  if (draftDate) onDateChange(draftDate);
                  setEditingDate(false);
                }}
                className="rounded border border-border bg-background px-2 py-0.5 text-sm"
              />
            ) : (
              <button
                onClick={() => {
                  setDraftDate(date);
                  setEditingDate(true);
                }}
                className="group inline-flex items-center gap-1 rounded px-1 py-0.5 text-sm text-muted-foreground hover:bg-muted/60"
              >
                {date}
                <span className="text-xs opacity-0 transition-opacity group-hover:opacity-100">&#9998;</span>
              </button>
            )}
          </div>
        </div>
        {diffDays > 0 && (
          <div className="flex flex-col items-center rounded-lg bg-muted px-3 py-2">
            <span className="text-lg font-bold text-foreground">{diffDays}</span>
            <span className="text-[10px] text-muted-foreground">dni</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────────── */
export default function ZdrowiePage() {
  // Monthly goals state
  const [goals, setGoals] = useState({
    activeCalories: { ...monthlyGoals.activeCalories },
    cycling: { ...monthlyGoals.cycling },
    cyclingHours: { ...monthlyGoals.cyclingHours },
    running: { ...monthlyGoals.running },
    competition: { ...monthlyGoals.competition },
  });

  // Gym state
  const [gymDays, setGymDays] = useState(sportAreas[0].weekDays);
  const [gymWeeklyGoal, setGymWeeklyGoal] = useState(sportAreas[0].weeklyGoal);
  const [gymMonthlyGoal, setGymMonthlyGoal] = useState(sportAreas[0].monthlyGoal);
  const [gymMonthlyDone, setGymMonthlyDone] = useState(sportAreas[0].current);

  // Running weekly entries (editable per day)
  const [runEntries, setRunEntries] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const [runWeeklyGoal, setRunWeeklyGoal] = useState(sportAreas[1].weeklyGoal);
  const [runMonthlyGoal, setRunMonthlyGoal] = useState(sportAreas[1].monthlyGoal);

  // Cycling weekly entries
  const [bikeEntries, setBikeEntries] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const [bikeWeeklyGoal, setBikeWeeklyGoal] = useState(sportAreas[2].weeklyGoal);
  const [bikeMonthlyGoal, setBikeMonthlyGoal] = useState(sportAreas[2].monthlyGoal);

  const runWeekTotal = runEntries.reduce((a, b) => a + b, 0);
  const bikeWeekTotal = bikeEntries.reduce((a, b) => a + b, 0);

  const updateGoal = (
    key: "activeCalories" | "cycling" | "cyclingHours" | "running",
    field: "current" | "target",
    value: number
  ) => {
    setGoals((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <BackButton />

        <div className="mt-4 flex items-center gap-3">
          <span className="text-3xl">&#10084;&#65039;</span>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Zdrowie i Fitness</h1>
            <p className="text-muted-foreground">
              Marzec 2026 — kliknij wartosci, aby edytowac
            </p>
          </div>
        </div>

        {/* ── Monthly goals (editable) ─────────────────────────── */}
        <h3 className="mt-8 text-lg font-semibold text-foreground">🎯 Cele Miesieczne</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MonthlyGoalCard
            icon="🔥"
            label="Aktywne kalorie"
            current={goals.activeCalories.current}
            target={goals.activeCalories.target}
            unit="kcal"
            color="#ef4444"
            onCurrentChange={(v) => updateGoal("activeCalories", "current", v)}
            onTargetChange={(v) => updateGoal("activeCalories", "target", v)}
          />
          <MonthlyGoalCard
            icon="🚴"
            label="Rower (km)"
            current={goals.cycling.current}
            target={goals.cycling.target}
            unit="km"
            color="#3b82f6"
            onCurrentChange={(v) => updateGoal("cycling", "current", v)}
            onTargetChange={(v) => updateGoal("cycling", "target", v)}
          />
          <MonthlyGoalCard
            icon="🕐"
            label="Rower (godziny)"
            current={goals.cyclingHours.current}
            target={goals.cyclingHours.target}
            unit="h"
            color="#6366f1"
            onCurrentChange={(v) => updateGoal("cyclingHours", "current", v)}
            onTargetChange={(v) => updateGoal("cyclingHours", "target", v)}
          />
          <MonthlyGoalCard
            icon="🏃"
            label="Bieganie"
            current={goals.running.current}
            target={goals.running.target}
            unit="km"
            color="#22c55e"
            onCurrentChange={(v) => updateGoal("running", "current", v)}
            onTargetChange={(v) => updateGoal("running", "target", v)}
          />
        </div>

        {/* ── Competition (editable) ───────────────────────────── */}
        <div className="mt-4">
          <CompetitionCard
            name={goals.competition.name}
            date={goals.competition.date}
            onNameChange={(v) =>
              setGoals((prev) => ({ ...prev, competition: { ...prev.competition, name: v } }))
            }
            onDateChange={(v) =>
              setGoals((prev) => ({ ...prev, competition: { ...prev.competition, date: v } }))
            }
          />
        </div>

        {/* ── Gym tracker ──────────────────────────────────────── */}
        <h3 className="mt-8 text-lg font-semibold text-foreground">🏅 Obszary Sportowe</h3>
        <div className="mt-3 grid gap-4">
          <GymTracker
            weekDays={gymDays}
            onToggleDay={(i) => {
              const next = [...gymDays];
              next[i] = !next[i];
              setGymDays(next);
            }}
            weeklyGoal={gymWeeklyGoal}
            monthlyGoal={gymMonthlyGoal}
            monthlyDone={gymMonthlyDone}
            onWeeklyGoalChange={setGymWeeklyGoal}
            onMonthlyGoalChange={setGymMonthlyGoal}
            onMonthlyDoneChange={setGymMonthlyDone}
          />

          {/* ── Running mountain chart ─────────────────────────── */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🏃</span>
                <div>
                  <h4 className="font-semibold text-foreground">Bieganie</h4>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Cel:</span>
                    <EditableNumber value={runWeeklyGoal} onSave={setRunWeeklyGoal} unit="km/tydz" className="text-xs" />
                    <span>|</span>
                    <EditableNumber value={runMonthlyGoal} onSave={setRunMonthlyGoal} unit="km/mies" className="text-xs" />
                  </div>
                </div>
              </div>
              <ProgressRing value={goals.running.current} max={goals.running.target} color="#22c55e" />
            </div>

            {/* Daily entries */}
            <div className="mt-4 flex gap-1">
              {["Pn", "Wt", "Sr", "Cz", "Pt", "Sb", "Nd"].map((day, i) => (
                <div key={day} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">{day}</span>
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={runEntries[i] || ""}
                    placeholder="0"
                    onChange={(e) => {
                      const next = [...runEntries];
                      next[i] = parseFloat(e.target.value) || 0;
                      setRunEntries(next);
                    }}
                    className="w-full rounded border border-border bg-background px-1 py-1 text-center text-xs"
                  />
                </div>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Tydzien: {runWeekTotal.toFixed(1)} / {runWeeklyGoal} km
            </p>

            {/* Mountain chart */}
            <MountainProgress
              current={runWeekTotal}
              target={runWeeklyGoal}
              weeklyEntries={runEntries}
              color="#22c55e"
              unit="km"
              label="📈 Postep tygodniowy"
            />
          </div>

          {/* ── Cycling mountain chart ─────────────────────────── */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🚴</span>
                <div>
                  <h4 className="font-semibold text-foreground">Rower</h4>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Cel:</span>
                    <EditableNumber value={bikeWeeklyGoal} onSave={setBikeWeeklyGoal} unit="km/tydz" className="text-xs" />
                    <span>|</span>
                    <EditableNumber value={bikeMonthlyGoal} onSave={setBikeMonthlyGoal} unit="km/mies" className="text-xs" />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
                  Garmin (wkrotce)
                </span>
                <ProgressRing value={goals.cycling.current} max={goals.cycling.target} color="#3b82f6" />
              </div>
            </div>

            {/* Daily entries */}
            <div className="mt-4 flex gap-1">
              {["Pn", "Wt", "Sr", "Cz", "Pt", "Sb", "Nd"].map((day, i) => (
                <div key={day} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">{day}</span>
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={bikeEntries[i] || ""}
                    placeholder="0"
                    onChange={(e) => {
                      const next = [...bikeEntries];
                      next[i] = parseFloat(e.target.value) || 0;
                      setBikeEntries(next);
                    }}
                    className="w-full rounded border border-border bg-background px-1 py-1 text-center text-xs"
                  />
                </div>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Tydzien: {bikeWeekTotal.toFixed(1)} / {bikeWeeklyGoal} km
            </p>

            {/* Mountain chart */}
            <MountainProgress
              current={bikeWeekTotal}
              target={bikeWeeklyGoal}
              weeklyEntries={bikeEntries}
              color="#3b82f6"
              unit="km"
              label="📈 Postep tygodniowy"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
