"use client";

import { useState, useCallback, useEffect } from "react";
import { BackButton } from "@/components/dashboard/back-button";
import { monthlyGoals, sportAreas } from "@/lib/data";
import { useLocalStorage, useGarminSync } from "@/lib/storage";

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
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {items.map((item) => (
            <div key={item.label} className="flex flex-col items-center rounded-lg bg-muted/50 p-3">
              <span className="text-xl">{item.icon}</span>
              <span className="mt-1 text-lg font-bold text-foreground">
                {item.format(item.value!)}
              </span>
              <span className="text-[10px] text-muted-foreground">{item.label}</span>
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
                className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{activityIcon(a.activityType)}</span>
                  <div>
                    <p className="text-sm font-medium text-foreground">{a.activityName}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.startTime.slice(11, 16)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
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

/* ── Main page ──────────────────────────────────────────────── */
// One-time migration: clear old mock data from localStorage
function clearOldMockData() {
  if (typeof window === "undefined") return;
  const migrated = localStorage.getItem("dashboard_v2_migrated");
  if (migrated) return;
  // Remove old cached values that had fake targets
  const keysToRemove = [
    "dashboard_goals",
    "dashboard_gym_days",
    "dashboard_gym_weekly_goal",
    "dashboard_gym_monthly_goal",
    "dashboard_gym_monthly_done",
    "dashboard_run_entries",
    "dashboard_run_weekly_goal",
    "dashboard_run_monthly_goal",
    "dashboard_bike_entries",
    "dashboard_bike_weekly_goal",
    "dashboard_bike_monthly_goal",
    "dashboard_recent_activities",
    "dashboard_garmin_cache",
  ];
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
  localStorage.setItem("dashboard_v2_migrated", "1");
}

export default function ZdrowiePage() {
  // Clear old mock data on first load after update
  useEffect(() => {
    clearOldMockData();
  }, []);

  // Monthly goals state — persisted in localStorage
  const [goals, setGoals] = useLocalStorage("dashboard_goals", {
    activeCalories: { ...monthlyGoals.activeCalories },
    cycling: { ...monthlyGoals.cycling },
    cyclingHours: { ...monthlyGoals.cyclingHours },
    running: { ...monthlyGoals.running },
    competition: { ...monthlyGoals.competition },
  });

  // Gym state — persisted
  const [gymDays, setGymDays] = useLocalStorage("dashboard_gym_days", sportAreas[0].weekDays);
  const [gymWeeklyGoal, setGymWeeklyGoal] = useLocalStorage("dashboard_gym_weekly_goal", sportAreas[0].weeklyGoal);
  const [gymMonthlyGoal, setGymMonthlyGoal] = useLocalStorage("dashboard_gym_monthly_goal", sportAreas[0].monthlyGoal);
  const [gymMonthlyDone, setGymMonthlyDone] = useLocalStorage("dashboard_gym_monthly_done", sportAreas[0].current);

  // Running weekly entries — persisted
  const [runEntries, setRunEntries] = useLocalStorage<number[]>("dashboard_run_entries", [0, 0, 0, 0, 0, 0, 0]);
  const [runWeeklyGoal, setRunWeeklyGoal] = useLocalStorage("dashboard_run_weekly_goal", sportAreas[1].weeklyGoal);
  const [runMonthlyGoal, setRunMonthlyGoal] = useLocalStorage("dashboard_run_monthly_goal", sportAreas[1].monthlyGoal);

  // Cycling weekly entries — persisted
  const [bikeEntries, setBikeEntries] = useLocalStorage<number[]>("dashboard_bike_entries", [0, 0, 0, 0, 0, 0, 0]);
  const [bikeWeeklyGoal, setBikeWeeklyGoal] = useLocalStorage("dashboard_bike_weekly_goal", sportAreas[2].weeklyGoal);
  const [bikeMonthlyGoal, setBikeMonthlyGoal] = useLocalStorage("dashboard_bike_monthly_goal", sportAreas[2].monthlyGoal);

  // Garmin sync (with caching)
  const garmin = useGarminSync();
  const [recentActivities, setRecentActivities] = useLocalStorage<GarminActivity[]>("dashboard_recent_activities", []);

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

  // Load cached activities on mount
  useEffect(() => {
    if (garmin.data) {
      setRecentActivities(garmin.data.activities);
    }
  }, [garmin.data, setRecentActivities]);


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
  }, [garmin, setGoals, setRunEntries, setBikeEntries, setGymMonthlyDone, setRecentActivities]);

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

        {/* ── Monthly goals (editable) ─────────────────────────── */}
        <h3 className="mt-8 text-lg font-semibold text-foreground">🎯 Cele Miesieczne</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
            <h3 className="mt-8 text-lg font-semibold text-foreground">📋 Ostatnie aktywnosci (Garmin)</h3>
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
                    className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 shadow-sm"
                  >
                    <div className="flex items-center gap-3">
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
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
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
