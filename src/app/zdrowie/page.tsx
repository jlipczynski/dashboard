"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { BackButton } from "@/components/dashboard/back-button";
import { monthlyGoals, sportAreas } from "@/lib/data";
import { useGarminSync, useGoalsSync, type GoalsSyncState } from "@/lib/storage";

type GarminActivity = {
  id: number;
  name: string;
  type: string;
  distanceKm: number;
  durationMin: number;
  calories: number;
  date: string;
  avgHR?: number;
};

type TodayActivity = {
  activityName: string;
  activityType: string;
  calories: number;
  duration: string;
  distance: string | null;
  startTime: string;
  averageHR: number | null;
};

type WellnessData = {
  activeCalories: number | null;
  totalCalories: number | null;
  steps: number | null;
  restingHR: number | null;
  sleepHours: number | null;
  weightKg: number | null;
  bodyBattery: number | null;
  stressLevel: number | null;
  distanceKm: number | null;
  activities: TodayActivity[];
};

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
      title="Kliknij, aby edytowac"
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
      title="Kliknij, aby edytowac"
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

        {areaPath && <path d={areaPath} fill={color} opacity={0.15} />}
        {linePath && <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill={color} />
        ))}
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
  onTargetChange,
}: {
  icon: string;
  label: string;
  current: number;
  target: number;
  unit: string;
  color: string;
  onTargetChange: (v: number) => void;
}) {
  const [editingTarget, setEditingTarget] = useState(false);
  const [draft, setDraft] = useState(String(target));

  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 sm:gap-2">
          <span className="text-lg sm:text-xl">{icon}</span>
          <span className="text-xs font-medium text-foreground truncate sm:text-sm">{label}</span>
        </div>
        <ProgressRing value={current} max={target} color={color} size={48} />
      </div>
      <div className="mt-2 sm:mt-3">
        <ProgressBar value={current} max={target} color={color} />
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="font-semibold text-foreground">
            {current > 0 ? current : 0} <span className="text-xs font-normal text-muted-foreground">{unit}</span>
          </span>
          {target === 0 && !editingTarget ? (
            <button
              onClick={() => { setDraft(""); setEditingTarget(true); }}
              className="rounded-md bg-muted px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
            >
              Ustaw cel
            </button>
          ) : editingTarget ? (
            <form
              className="inline-flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                const n = parseFloat(draft);
                if (!isNaN(n) && n > 0) onTargetChange(n);
                setEditingTarget(false);
              }}
            >
              <input
                autoFocus
                type="number"
                min={1}
                step="any"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="cel"
                className="w-20 rounded border border-border bg-background px-2 py-1 text-xs text-right"
              />
              <span className="text-xs text-muted-foreground">{unit}</span>
              <button
                type="submit"
                className="ml-1 rounded-md bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 transition-colors"
              >
                Zapisz
              </button>
              <button
                type="button"
                onClick={() => setEditingTarget(false)}
                className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground hover:bg-muted/80 transition-colors"
              >
                Anuluj
              </button>
            </form>
          ) : (
            <button
              onClick={() => { setDraft(String(target)); setEditingTarget(true); }}
              className="group inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-muted/60"
            >
              cel: {target} {unit}
              <span className="opacity-0 group-hover:opacity-100 transition-opacity">&#9998;</span>
            </button>
          )}
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
  type,
  distance,
  onNameChange,
  onDateChange,
  onTypeChange,
  onDistanceChange,
}: {
  name: string;
  date: string;
  type: "running" | "cycling";
  distance: number;
  onNameChange: (v: string) => void;
  onDateChange: (v: string) => void;
  onTypeChange: (v: "running" | "cycling") => void;
  onDistanceChange: (v: number) => void;
}) {
  const [editingDate, setEditingDate] = useState(false);
  const [draftDate, setDraftDate] = useState(date);

  const today = new Date();
  const compDate = new Date(date);
  const diffDays = date ? Math.ceil((compDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const typeIcon = type === "cycling" ? "🚴" : "🏃";

  const hasData = name || date;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="text-2xl">🏆</span>
        <h4 className="font-semibold text-foreground">Najblizsze zawody</h4>
      </div>

      <div className="mt-3 grid gap-3 grid-cols-2 sm:mt-4">
        {/* Name */}
        <div>
          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Nazwa</label>
          <EditableText
            value={name || "Wpisz nazwe..."}
            onSave={onNameChange}
            className="mt-0.5 block text-sm text-foreground"
          />
        </div>

        {/* Date */}
        <div>
          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Data</label>
          <div className="mt-0.5">
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
                onClick={() => { setDraftDate(date); setEditingDate(true); }}
                className="group inline-flex items-center gap-1 rounded px-1 py-0.5 text-sm text-foreground hover:bg-muted/60"
              >
                {date || "Wybierz date..."}
                <span className="text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">&#9998;</span>
              </button>
            )}
          </div>
        </div>

        {/* Type toggle */}
        <div>
          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Typ</label>
          <div className="mt-1 flex gap-1">
            <button
              onClick={() => onTypeChange("running")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                type === "running"
                  ? "bg-green-500 text-white shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              🏃 Bieg
            </button>
            <button
              onClick={() => onTypeChange("cycling")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                type === "cycling"
                  ? "bg-blue-500 text-white shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              🚴 Rower
            </button>
          </div>
        </div>

        {/* Distance */}
        <div>
          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Dystans</label>
          <div className="mt-0.5">
            <EditableNumber value={distance} onSave={onDistanceChange} unit="km" className="text-sm" />
          </div>
        </div>
      </div>

      {/* Summary bar */}
      {hasData && (
        <div className="mt-4 flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-lg">{typeIcon}</span>
            <span className="font-medium text-foreground">{name}</span>
            {distance > 0 && (
              <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">{distance} km</span>
            )}
          </div>
          {diffDays > 0 && (
            <div className="flex flex-col items-center rounded-lg bg-background px-3 py-1.5">
              <span className="text-lg font-bold text-foreground">{diffDays}</span>
              <span className="text-[10px] text-muted-foreground">dni</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Wellness widget ────────────────────────────────────────── */
function WellnessWidget({ data }: { data: WellnessData }) {
  // Calculate per-type distances from today's activities
  const cyclingKm = data.activities
    .filter((a) => a.activityType.includes("cycling") || a.activityType.includes("biking"))
    .reduce((sum, a) => sum + (a.distance ? parseFloat(a.distance) : 0), 0);
  const runningKm = data.activities
    .filter((a) => a.activityType.includes("running"))
    .reduce((sum, a) => sum + (a.distance ? parseFloat(a.distance) : 0), 0);
  const otherKm = (data.distanceKm ?? 0) - cyclingKm - runningKm;

  const items = [
    { icon: "🔥", label: "Akt. kalorie", value: data.activeCalories, format: (v: number) => `${v} kcal` },
    { icon: "📊", label: "Kalorie total", value: data.totalCalories, format: (v: number) => `${v} kcal` },
    { icon: "👣", label: "Kroki", value: data.steps, format: (v: number) => v.toLocaleString("pl-PL") },
    { icon: "🚴", label: "Rower", value: cyclingKm > 0 ? cyclingKm : null, format: (v: number) => `${v.toFixed(1)} km` },
    { icon: "🏃", label: "Bieg", value: runningKm > 0 ? runningKm : null, format: (v: number) => `${v.toFixed(1)} km` },
    { icon: "🚶", label: "Inne km", value: otherKm > 0.5 ? otherKm : null, format: (v: number) => `${v.toFixed(1)} km` },
    { icon: "❤️", label: "Tetno spocz.", value: data.restingHR, format: (v: number) => `${v} bpm` },
    { icon: "😴", label: "Sen", value: data.sleepHours, format: (v: number) => `${v}h` },
    { icon: "🔋", label: "Body Battery", value: data.bodyBattery, format: (v: number) => `${v}` },
    { icon: "⚖️", label: "Waga", value: data.weightKg, format: (v: number) => `${v} kg` },
  ].filter((item) => item.value !== null);

  const activityIcon = (type: string) =>
    type.includes("cycling") || type.includes("biking") ? "🚴" :
    type.includes("running") ? "🏃" :
    type.includes("strength") || type.includes("training") ? "🏋️" :
    type.includes("swimming") ? "🏊" :
    type.includes("walking") || type.includes("hiking") ? "🚶" :
    "🏅";

  if (items.length === 0 && data.activities.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h4 className="flex items-center gap-2 font-semibold text-foreground">
        📊 Dzisiejszy stan (Garmin)
      </h4>

      {items.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3">
          {items.map((item) => (
            <div key={item.label} className="flex flex-col items-center rounded-lg bg-muted/50 p-2 sm:p-3">
              <span className="text-lg sm:text-xl">{item.icon}</span>
              <span className="mt-0.5 text-sm font-bold text-foreground sm:mt-1 sm:text-lg">
                {item.format(item.value!)}
              </span>
              <span className="text-[9px] text-muted-foreground sm:text-[10px]">{item.label}</span>
            </div>
          ))}
        </div>
      )}

      {data.activities.length > 0 && (
        <div className="mt-4">
          <h5 className="text-sm font-medium text-muted-foreground">Dzisiejsze aktywnosci</h5>
          <div className="mt-2 space-y-2">
            {data.activities.map((a, i) => (
              <div
                key={i}
                className="flex flex-col gap-1 rounded-lg bg-muted/50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-3"
              >
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="text-lg">{activityIcon(a.activityType)}</span>
                  <div>
                    <p className="text-sm font-medium text-foreground">{a.activityName}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.startTime.slice(11, 16)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 pl-7 text-xs text-muted-foreground sm:gap-4 sm:pl-0">
                  {a.distance && <span>{a.distance}</span>}
                  <span>{a.duration}</span>
                  <span className="font-semibold text-orange-500">{a.calories} kcal</span>
                  {a.averageHR && <span>&#10084; {a.averageHR}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── MFP Nutrition / Calorie Deficit ─────────────────────────── */
type NutritionEntry = {
  date: string;
  calories: number;
  fat_g: number;
  carbs_g: number;
  protein_g: number;
};

function MfpWidget({
  entries,
  onImport,
  importing,
  importResult,
  totalCaloriesBurned,
}: {
  entries: NutritionEntry[];
  onImport: (csv: string) => void;
  importing: boolean;
  importResult: string | null;
  totalCaloriesBurned: number | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    onImport(text);
    e.target.value = "";
  };

  // Last 14 days for the chart
  const last14 = entries.slice(0, 14).reverse();

  // Today's entry
  const today = new Date().toISOString().split("T")[0];
  const todayEntry = entries.find((e) => e.date === today);

  // Compute deficit: burned - consumed
  const todayDeficit =
    totalCaloriesBurned !== null && todayEntry
      ? totalCaloriesBurned - todayEntry.calories
      : null;

  // Average daily calories (all entries)
  const avgCal =
    entries.length > 0
      ? Math.round(entries.reduce((s, e) => s + e.calories, 0) / entries.length)
      : 0;

  // Chart dimensions
  const w = 420;
  const h = 160;
  const pad = { top: 20, right: 15, bottom: 28, left: 45 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  const maxCal = last14.length > 0 ? Math.max(...last14.map((e) => e.calories), 1) : 2500;
  const barW = last14.length > 0 ? chartW / last14.length - 3 : 20;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-2 font-semibold text-foreground">
          🍎 Kalorie (MyFitnessPal)
        </h4>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            onChange={handleFile}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-orange-600 disabled:opacity-50"
          >
            {importing ? "Importuję..." : "Importuj CSV"}
          </button>
        </div>
      </div>

      {importResult && (
        <div
          className={`mt-2 rounded-lg px-3 py-2 text-xs ${
            importResult.startsWith("!")
              ? "bg-red-50 text-red-600"
              : "bg-green-50 text-green-700"
          }`}
        >
          {importResult}
        </div>
      )}

      {/* Today's summary */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <div className="flex flex-col items-center rounded-lg bg-muted/50 p-3">
          <span className="text-xl">🍽️</span>
          <span className="mt-1 text-lg font-bold text-foreground">
            {todayEntry ? todayEntry.calories : "—"}
          </span>
          <span className="text-[10px] text-muted-foreground">Zjedzone kcal</span>
        </div>
        <div className="flex flex-col items-center rounded-lg bg-muted/50 p-3">
          <span className="text-xl">🔥</span>
          <span className="mt-1 text-lg font-bold text-foreground">
            {totalCaloriesBurned !== null ? totalCaloriesBurned : "—"}
          </span>
          <span className="text-[10px] text-muted-foreground">Spalone kcal</span>
        </div>
        <div className="flex flex-col items-center rounded-lg bg-muted/50 p-3">
          <span className="text-xl">{todayDeficit !== null && todayDeficit > 0 ? "📉" : "📈"}</span>
          <span
            className={`mt-1 text-lg font-bold ${
              todayDeficit !== null
                ? todayDeficit > 0
                  ? "text-green-600"
                  : "text-red-500"
                : "text-foreground"
            }`}
          >
            {todayDeficit !== null ? `${todayDeficit > 0 ? "-" : "+"}${Math.abs(todayDeficit)}` : "—"}
          </span>
          <span className="text-[10px] text-muted-foreground">Deficyt/nadwyzka</span>
        </div>
        <div className="flex flex-col items-center rounded-lg bg-muted/50 p-3">
          <span className="text-xl">📊</span>
          <span className="mt-1 text-lg font-bold text-foreground">{avgCal || "—"}</span>
          <span className="text-[10px] text-muted-foreground">Srednia kcal/dzien</span>
        </div>
      </div>

      {/* Macros for today */}
      {todayEntry && (
        <div className="mt-3 flex items-center justify-center gap-6 text-xs">
          <span>
            <span className="font-semibold text-blue-600">{todayEntry.protein_g}g</span>{" "}
            <span className="text-muted-foreground">bialko</span>
          </span>
          <span>
            <span className="font-semibold text-amber-600">{todayEntry.carbs_g}g</span>{" "}
            <span className="text-muted-foreground">wegle</span>
          </span>
          <span>
            <span className="font-semibold text-red-500">{todayEntry.fat_g}g</span>{" "}
            <span className="text-muted-foreground">tluszcz</span>
          </span>
        </div>
      )}

      {/* Bar chart */}
      {last14.length > 0 && (
        <svg viewBox={`0 0 ${w} ${h}`} className="mt-4 w-full" style={{ maxWidth: w }}>
          {/* Y axis grid */}
          {[0, 0.5, 1].map((frac) => {
            const y = pad.top + chartH - frac * chartH;
            return (
              <g key={frac}>
                <line
                  x1={pad.left}
                  y1={y}
                  x2={w - pad.right}
                  y2={y}
                  stroke="#e5e7eb"
                  strokeWidth={0.5}
                />
                <text
                  x={pad.left - 4}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-muted-foreground"
                  fontSize={8}
                >
                  {Math.round(frac * maxCal)}
                </text>
              </g>
            );
          })}
          {/* Bars */}
          {last14.map((entry, i) => {
            const barH = (entry.calories / maxCal) * chartH;
            const x = pad.left + i * (chartW / last14.length) + 1.5;
            const y = pad.top + chartH - barH;
            const dayLabel = new Date(entry.date + "T12:00:00").toLocaleDateString("pl-PL", {
              day: "numeric",
              month: "numeric",
            });
            return (
              <g key={entry.date}>
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={barH}
                  rx={2}
                  fill={entry.calories > 2200 ? "#ef4444" : "#f97316"}
                  opacity={0.75}
                />
                <text
                  x={x + barW / 2}
                  y={h - 5}
                  textAnchor="middle"
                  className="fill-muted-foreground"
                  fontSize={7}
                >
                  {dayLabel}
                </text>
              </g>
            );
          })}
        </svg>
      )}

      {entries.length === 0 && (
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Brak danych. Wyeksportuj CSV z MyFitnessPal i zaimportuj tutaj.
        </p>
      )}
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────────── */
export default function ZdrowiePage() {

  // All goals persisted to Supabase (with localStorage cache)
  const goalsDefaults: GoalsSyncState = {
    goals: {
      activeCalories: { ...monthlyGoals.activeCalories },
      cycling: { ...monthlyGoals.cycling },
      cyclingHours: { ...monthlyGoals.cyclingHours },
      running: { ...monthlyGoals.running },
      competition: { ...monthlyGoals.competition },
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
  const { state: gs, setState: setGs, saving: goalsSaving } = useGoalsSync(goalsDefaults);

  // Convenient accessors
  const goals = gs.goals;
  const setGoals = (updater: typeof gs.goals | ((prev: typeof gs.goals) => typeof gs.goals)) => {
    setGs((prev) => ({
      ...prev,
      goals: typeof updater === "function" ? updater(prev.goals) : updater,
    }));
  };
  const gymDays = gs.gymDays;
  const setGymDays = (v: boolean[]) => setGs((p) => ({ ...p, gymDays: v }));
  const gymWeeklyGoal = gs.gymWeeklyGoal;
  const setGymWeeklyGoal = (v: number) => setGs((p) => ({ ...p, gymWeeklyGoal: v }));
  const gymMonthlyGoal = gs.gymMonthlyGoal;
  const setGymMonthlyGoal = (v: number) => setGs((p) => ({ ...p, gymMonthlyGoal: v }));
  const gymMonthlyDone = gs.gymMonthlyDone;
  const setGymMonthlyDone = (v: number) => setGs((p) => ({ ...p, gymMonthlyDone: v }));
  const runWeeklyGoal = gs.runWeeklyGoal;
  const setRunWeeklyGoal = (v: number) => setGs((p) => ({ ...p, runWeeklyGoal: v }));
  const runMonthlyGoal = gs.runMonthlyGoal;
  const setRunMonthlyGoal = (v: number) => setGs((p) => ({ ...p, runMonthlyGoal: v }));
  const bikeWeeklyGoal = gs.bikeWeeklyGoal;
  const setBikeWeeklyGoal = (v: number) => setGs((p) => ({ ...p, bikeWeeklyGoal: v }));
  const bikeMonthlyGoal = gs.bikeMonthlyGoal;
  const setBikeMonthlyGoal = (v: number) => setGs((p) => ({ ...p, bikeMonthlyGoal: v }));

  // Running/cycling weekly entries (Supabase-backed via goalsSync)
  const runEntries = gs.runEntries;
  const setRunEntries = (v: number[]) => setGs((p) => ({ ...p, runEntries: v }));
  const bikeEntries = gs.bikeEntries;
  const setBikeEntries = (v: number[]) => setGs((p) => ({ ...p, bikeEntries: v }));

  // Garmin sync (with caching)
  const garmin = useGarminSync();
  const [recentActivities, setRecentActivities] = useState<GarminActivity[]>([]);

  // Wellness data
  const [wellness, setWellness] = useState<WellnessData>({
    activeCalories: null,
    totalCalories: null,
    steps: null,
    restingHR: null,
    sleepHours: null,
    weightKg: null,
    bodyBattery: null,
    stressLevel: null,
    distanceKm: null,
    activities: [],
  });

  // MFP nutrition data
  const [mfpEntries, setMfpEntries] = useState<NutritionEntry[]>([]);
  const [mfpImporting, setMfpImporting] = useState(false);
  const [mfpResult, setMfpResult] = useState<string | null>(null);

  // Fetch MFP data on mount
  useEffect(() => {
    fetch("/api/mfp?days=30")
      .then((r) => r.json())
      .then((d) => {
        if (d.entries) setMfpEntries(d.entries);
      })
      .catch(() => {});
  }, []);

  const importMfpCsv = useCallback(async (csv: string) => {
    setMfpImporting(true);
    setMfpResult(null);
    try {
      const res = await fetch("/api/mfp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const data = await res.json();
      if (data.error) {
        setMfpResult(`! ${data.error}`);
      } else {
        setMfpResult(`Zaimportowano ${data.imported} dni (${data.from} - ${data.to})`);
        // Refetch
        const r = await fetch("/api/mfp?days=30");
        const d = await r.json();
        if (d.entries) setMfpEntries(d.entries);
      }
    } catch (err) {
      setMfpResult(`! Blad importu: ${err instanceof Error ? err.message : "Unknown"}`);
    }
    setMfpImporting(false);
  }, []);

  // Load cached activities on mount
  useEffect(() => {
    if (garmin.data) {
      setRecentActivities(garmin.data.activities);
    }
  }, [garmin.data]);


  const syncGarmin = useCallback(async () => {
    const data = await garmin.sync(true);
    if (data) {
      // Update monthly goals with Garmin data
      setGoals((prev) => ({
        ...prev,
        activeCalories: { ...prev.activeCalories, current: data.summary.month.activeCalories },
        cycling: { ...prev.cycling, current: data.summary.month.cyclingKm },
        cyclingHours: { ...prev.cyclingHours, current: data.summary.month.cyclingHours },
        running: { ...prev.running, current: data.summary.month.runningKm },
      }));

      // Update weekly entries
      setRunEntries(data.summary.week.dailyRunning);
      setBikeEntries(data.summary.week.dailyCycling);

      // Update gym
      setGymMonthlyDone(data.summary.month.gymSessions);
      setRecentActivities(data.activities);
    }

    // Also fetch wellness data
    try {
      const wellnessRes = await fetch("/api/garmin/wellness");
      const wellnessData = await wellnessRes.json();
      if (!wellnessData.error) {
        setWellness({
          activeCalories: wellnessData.today.activeCalories,
          totalCalories: wellnessData.today.totalCalories,
          steps: wellnessData.today.steps,
          restingHR: wellnessData.today.restingHR,
          sleepHours: wellnessData.today.sleepHours,
          weightKg: wellnessData.today.weightKg,
          bodyBattery: wellnessData.today.bodyBattery,
          stressLevel: wellnessData.today.stressLevel,
          distanceKm: wellnessData.today.distanceKm,
          activities: wellnessData.activities ?? [],
        });
      }
    } catch {
      // wellness is optional
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [garmin]);

  // Auto-sync with Garmin on page load
  const [autoSynced, setAutoSynced] = useState(false);
  useEffect(() => {
    if (!autoSynced) {
      setAutoSynced(true);
      syncGarmin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSynced]);

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

  const lastSyncTime = garmin.data
    ? new Date(garmin.data.syncedAt).toLocaleTimeString("pl-PL")
    : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <BackButton />

        <div className="mt-4 flex items-center gap-3">
          <span className="text-3xl">&#10084;&#65039;</span>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Zdrowie i Fitness</h1>
            <p className="text-muted-foreground">
              Kliknij wartosci celow, aby je ustawic
              {goalsSaving && <span className="ml-2 text-xs text-blue-500">Zapisuje...</span>}
            </p>
          </div>
        </div>

        {/* ── Garmin sync ──────────────────────────────────────── */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            onClick={syncGarmin}
            disabled={garmin.syncing}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-green-700 disabled:opacity-50"
          >
            {garmin.syncing ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Synchronizuje...
              </>
            ) : (
              <>
                <span>&#9889;</span>
                Synchronizuj z Garmin
              </>
            )}
          </button>
          {lastSyncTime && (
            <span className="text-xs text-muted-foreground">
              Ostatnia synchronizacja: {lastSyncTime}
            </span>
          )}
          {garmin.error && (
            <span className="text-xs text-red-500">{garmin.error}</span>
          )}
        </div>

        {/* ── Wellness widget (from Garmin) ──────────────────── */}
        {(wellness.steps !== null || wellness.restingHR !== null || wellness.activities.length > 0) && (
          <div className="mt-4">
            <WellnessWidget data={wellness} />
          </div>
        )}

        {/* ── MFP Nutrition / Deficit ──────────────────────────── */}
        <div className="mt-4">
          <MfpWidget
            entries={mfpEntries}
            onImport={importMfpCsv}
            importing={mfpImporting}
            importResult={mfpResult}
            totalCaloriesBurned={wellness.totalCalories}
          />
        </div>

        {/* ── Monthly goals (editable) ─────────────────────────── */}
        <h3 className="mt-6 text-lg font-semibold text-foreground sm:mt-8">🎯 Cele Miesieczne</h3>
        <div className="mt-3 grid gap-3 grid-cols-2 sm:gap-4 lg:grid-cols-3">
          <MonthlyGoalCard
            icon="🔥"
            label="Aktywne kalorie"
            current={goals.activeCalories.current}
            target={goals.activeCalories.target}
            unit="kcal"
            color="#ef4444"
            onTargetChange={(v) => updateGoal("activeCalories", "target", v)}
          />
          <MonthlyGoalCard
            icon="🚴"
            label="Rower (km)"
            current={goals.cycling.current}
            target={goals.cycling.target}
            unit="km"
            color="#3b82f6"
            onTargetChange={(v) => updateGoal("cycling", "target", v)}
          />
          <MonthlyGoalCard
            icon="🕐"
            label="Rower (godziny)"
            current={goals.cyclingHours.current}
            target={goals.cyclingHours.target}
            unit="h"
            color="#6366f1"
            onTargetChange={(v) => updateGoal("cyclingHours", "target", v)}
          />
          <MonthlyGoalCard
            icon="🏃"
            label="Bieganie"
            current={goals.running.current}
            target={goals.running.target}
            unit="km"
            color="#22c55e"
            onTargetChange={(v) => updateGoal("running", "target", v)}
          />
          <MonthlyGoalCard
            icon="🏋️"
            label="Silownia"
            current={gymMonthlyDone}
            target={gymMonthlyGoal}
            unit="treningow"
            color="#a855f7"
            onTargetChange={setGymMonthlyGoal}
          />
        </div>

        {/* ── Weekly goals (auto-calculated) ─────────────────────── */}
        <h3 className="mt-6 text-lg font-semibold text-foreground sm:mt-8">📅 Cele Tygodniowe</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3 sm:gap-4">
          {/* Running weekly */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🏃</span>
                <span className="text-sm font-medium text-foreground">Bieganie</span>
              </div>
              <ProgressRing value={runWeekTotal} max={runWeeklyGoal} color="#22c55e" size={56} />
            </div>
            <div className="mt-3">
              <ProgressBar value={runWeekTotal} max={runWeeklyGoal} color="#22c55e" />
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="font-semibold text-foreground">
                  {runWeekTotal.toFixed(1)} <span className="text-xs font-normal text-muted-foreground">km</span>
                </span>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span>cel:</span>
                  <EditableNumber value={runWeeklyGoal} onSave={setRunWeeklyGoal} unit="km" className="text-xs" />
                </div>
              </div>
            </div>
          </div>

          {/* Cycling weekly */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🚴</span>
                <span className="text-sm font-medium text-foreground">Rower</span>
              </div>
              <ProgressRing value={bikeWeekTotal} max={bikeWeeklyGoal} color="#3b82f6" size={56} />
            </div>
            <div className="mt-3">
              <ProgressBar value={bikeWeekTotal} max={bikeWeeklyGoal} color="#3b82f6" />
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="font-semibold text-foreground">
                  {bikeWeekTotal.toFixed(1)} <span className="text-xs font-normal text-muted-foreground">km</span>
                </span>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span>cel:</span>
                  <EditableNumber value={bikeWeeklyGoal} onSave={setBikeWeeklyGoal} unit="km" className="text-xs" />
                </div>
              </div>
            </div>
          </div>

          {/* Gym weekly */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🏋️</span>
                <span className="text-sm font-medium text-foreground">Silownia</span>
              </div>
              <ProgressRing value={gymDays.filter(Boolean).length} max={gymWeeklyGoal} color="#a855f7" size={56} />
            </div>
            <div className="mt-3">
              <ProgressBar value={gymDays.filter(Boolean).length} max={gymWeeklyGoal} color="#a855f7" />
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="font-semibold text-foreground">
                  {gymDays.filter(Boolean).length} <span className="text-xs font-normal text-muted-foreground">treningow</span>
                </span>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span>cel:</span>
                  <EditableNumber value={gymWeeklyGoal} onSave={setGymWeeklyGoal} unit="x" className="text-xs" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Competition (editable) ───────────────────────────── */}
        <div className="mt-4">
          <CompetitionCard
            name={goals.competition.name}
            date={goals.competition.date}
            type={goals.competition.type ?? "running"}
            distance={goals.competition.distance ?? 0}
            onNameChange={(v) =>
              setGoals((prev) => ({ ...prev, competition: { ...prev.competition, name: v } }))
            }
            onDateChange={(v) =>
              setGoals((prev) => ({ ...prev, competition: { ...prev.competition, date: v } }))
            }
            onTypeChange={(v) =>
              setGoals((prev) => ({ ...prev, competition: { ...prev.competition, type: v } }))
            }
            onDistanceChange={(v) =>
              setGoals((prev) => ({ ...prev, competition: { ...prev.competition, distance: v } }))
            }
          />
        </div>

        {/* ── Gym tracker ──────────────────────────────────────── */}
        <h3 className="mt-6 text-lg font-semibold text-foreground sm:mt-8">🏅 Obszary Sportowe</h3>
        <div className="mt-3 grid gap-3 sm:gap-4">
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
              <ProgressRing value={goals.cycling.current} max={goals.cycling.target} color="#3b82f6" />
            </div>

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

        {/* ── Recent Garmin activities ─────────────────────────── */}
        {recentActivities.length > 0 && (
          <>
            <h3 className="mt-6 text-lg font-semibold text-foreground sm:mt-8">📋 Ostatnie aktywnosci (Garmin)</h3>
            <div className="mt-3 space-y-2">
              {recentActivities.slice(0, 10).map((a) => {
                const typeIcon =
                  a.type.includes("cycling") ? "🚴" :
                  a.type.includes("running") ? "🏃" :
                  a.type.includes("strength") || a.type.includes("training") ? "🏋️" :
                  "🏅";
                return (
                  <div
                    key={a.id}
                    className="flex flex-col gap-1 rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-3"
                  >
                    <div className="flex items-center gap-2 sm:gap-3">
                      <span className="text-lg">{typeIcon}</span>
                      <div>
                        <p className="text-sm font-medium text-foreground">{a.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(a.date).toLocaleDateString("pl-PL", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pl-7 text-xs text-muted-foreground sm:gap-4 sm:pl-0">
                      {a.distanceKm > 0 && <span>{a.distanceKm} km</span>}
                      <span>{a.durationMin} min</span>
                      <span>{a.calories} kcal</span>
                      {a.avgHR && <span>&#10084; {a.avgHR}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
