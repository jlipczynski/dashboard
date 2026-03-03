"use client";

import { useState, useEffect, useCallback } from "react";
import { BackButton } from "@/components/dashboard/back-button";
import { useGoalsSync, type GoalsSyncState } from "@/lib/storage";
import { monthlyGoals, sportAreas } from "@/lib/data";

/* ── Types ──────────────────────────────────────── */
type Entry = {
  id: string;
  area: string;
  date: string;
  amount: number;
};

type Targets = {
  czytanie: { monthly: number; weekly: number };
  sluchanie: { monthly: number; weekly: number };
  pisanie: { monthly: number; weekly: number };
};

type AreaKey = "czytanie" | "sluchanie" | "pisanie";

const DEFAULT_TARGETS: Targets = {
  czytanie: { monthly: 300, weekly: 75 },
  sluchanie: { monthly: 600, weekly: 150 },
  pisanie: { monthly: 30, weekly: 8 },
};

const AREAS: {
  key: AreaKey;
  name: string;
  icon: string;
  unit: string;
  unitShort: string;
  color: string;
  colorLight: string;
  colorBorder: string;
  placeholder: string;
}[] = [
  {
    key: "czytanie",
    name: "Czytanie",
    icon: "📖",
    unit: "stron",
    unitShort: "str.",
    color: "#8B5CF6",
    colorLight: "#F5F3FF",
    colorBorder: "#DDD6FE",
    placeholder: "Ile stron dzisiaj?",
  },
  {
    key: "sluchanie",
    name: "Sluchanie",
    icon: "🎧",
    unit: "minut",
    unitShort: "min",
    color: "#0EA5E9",
    colorLight: "#F0F9FF",
    colorBorder: "#BAE6FD",
    placeholder: "Ile minut dzisiaj?",
  },
  {
    key: "pisanie",
    name: "Pisanie",
    icon: "✍️",
    unit: "stron",
    unitShort: "str.",
    color: "#F59E0B",
    colorLight: "#FFFBEB",
    colorBorder: "#FDE68A",
    placeholder: "Ile stron dzisiaj?",
  },
];

/* ── Helpers ───────────────────────────────────── */
function today() {
  return new Date().toISOString().split("T")[0];
}

function getMonthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0];
}

function getWeekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  return new Date(d.getFullYear(), d.getMonth(), diff).toISOString().split("T")[0];
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("pl-PL", { day: "numeric", month: "short", weekday: "short" });
}

/* ── Progress Bar ───────────────────────────────── */
function ProgressBar({
  current,
  target,
  color,
  colorLight,
  height = 10,
}: {
  current: number;
  target: number;
  color: string;
  colorLight: string;
  height?: number;
}) {
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  return (
    <div
      className="w-full overflow-hidden rounded-full"
      style={{ height, background: colorLight }}
    >
      <div
        className="h-full rounded-full transition-all duration-500 ease-out"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

/* ── Area Card ──────────────────────────────────── */
function AreaCard({
  area,
  entries,
  targets,
  onAddEntry,
  onEditEntry,
  onDeleteEntry,
  onTargetChange,
  saving,
}: {
  area: (typeof AREAS)[number];
  entries: Entry[];
  targets: { monthly: number; weekly: number };
  onAddEntry: (area: AreaKey, date: string, amount: number) => void;
  onEditEntry: (area: AreaKey, date: string, amount: number) => void;
  onDeleteEntry: (id: string) => void;
  onTargetChange: (field: "monthly" | "weekly", value: number) => void;
  saving: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [showHistory, setShowHistory] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editingTarget, setEditingTarget] = useState<"monthly" | "weekly" | null>(null);
  const [targetDraft, setTargetDraft] = useState("");

  const monthStart = getMonthStart();
  const weekStart = getWeekStart();

  const monthlyDone = entries
    .filter((e) => e.date >= monthStart)
    .reduce((s, e) => s + e.amount, 0);
  const weeklyDone = entries
    .filter((e) => e.date >= weekStart)
    .reduce((s, e) => s + e.amount, 0);

  const monthPct = targets.monthly > 0 ? Math.round((monthlyDone / targets.monthly) * 100) : 0;
  const weekPct = targets.weekly > 0 ? Math.round((weeklyDone / targets.weekly) * 100) : 0;

  // Today's entry
  const todayEntry = entries.find((e) => e.date === today());

  const handleSubmit = () => {
    const n = parseInt(amount);
    if (!isNaN(n) && n > 0) {
      // If entry for this date already exists, add to it
      const existing = entries.find((e) => e.date === date);
      if (existing) {
        onEditEntry(area.key, date, existing.amount + n);
      } else {
        onAddEntry(area.key, date, n);
      }
      setAmount("");
      setDate(today());
    }
  };

  // Last 30 entries for history
  const historyEntries = [...entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);

  return (
    <div
      className="rounded-2xl border bg-card p-4 shadow-sm sm:p-6"
      style={{ borderColor: area.colorBorder }}
    >
      {/* Header with monthly ring */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl text-xl"
            style={{ background: area.colorLight }}
          >
            {area.icon}
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">{area.name}</h3>
            <p className="text-xs text-muted-foreground">
              {monthlyDone} / {targets.monthly} {area.unit} w marcu
            </p>
          </div>
        </div>
        {todayEntry && (
          <div className="flex flex-col items-center rounded-lg px-3 py-1" style={{ background: area.colorLight }}>
            <span className="text-lg font-bold" style={{ color: area.color }}>{todayEntry.amount}</span>
            <span className="text-[10px] text-muted-foreground">dzisiaj</span>
          </div>
        )}
      </div>

      {/* Add entry form */}
      <form
        className="mt-4 flex items-center gap-2"
        onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
      >
        <input
          type="number"
          min={1}
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={area.placeholder}
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2"
          style={{ ["--tw-ring-color" as string]: area.color + "40" } as React.CSSProperties}
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-[130px] shrink-0 rounded-lg border border-border bg-background px-2 py-2.5 text-xs text-foreground focus:outline-none"
        />
        <button
          type="submit"
          disabled={saving}
          className="shrink-0 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all active:scale-95 disabled:opacity-50"
          style={{ background: area.color }}
        >
          {saving ? "..." : "Dodaj"}
        </button>
      </form>

      {/* Monthly progress */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Marzec
          </span>
          <span className="text-sm font-medium" style={{ color: area.color }}>
            {monthPct}%
          </span>
        </div>
        <ProgressBar
          current={monthlyDone}
          target={targets.monthly}
          color={area.color}
          colorLight={area.colorLight}
          height={10}
        />
        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>{monthlyDone} / {targets.monthly} {area.unitShort}</span>
          {editingTarget === "monthly" ? (
            <form className="inline-flex items-center gap-1" onSubmit={(e) => {
              e.preventDefault();
              const n = parseInt(targetDraft);
              if (!isNaN(n) && n > 0) onTargetChange("monthly", n);
              setEditingTarget(null);
            }}>
              <input autoFocus type="number" min={1} value={targetDraft}
                onChange={(e) => setTargetDraft(e.target.value)}
                onBlur={() => {
                  const n = parseInt(targetDraft);
                  if (!isNaN(n) && n > 0) onTargetChange("monthly", n);
                  setEditingTarget(null);
                }}
                className="w-16 rounded border border-border bg-background px-1.5 py-0.5 text-xs text-right" />
              <span className="text-[10px]">{area.unitShort}</span>
            </form>
          ) : (
            <button onClick={() => { setTargetDraft(String(targets.monthly)); setEditingTarget("monthly"); }}
              className="hover:underline">cel: {targets.monthly}</button>
          )}
        </div>
      </div>

      {/* Weekly progress */}
      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Tydzien
          </span>
          <span className="text-sm font-medium" style={{ color: area.color }}>
            {weekPct}%
          </span>
        </div>
        <ProgressBar
          current={weeklyDone}
          target={targets.weekly}
          color={area.color}
          colorLight={area.colorLight}
          height={7}
        />
        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>{weeklyDone} / {targets.weekly} {area.unitShort}</span>
          {editingTarget === "weekly" ? (
            <form className="inline-flex items-center gap-1" onSubmit={(e) => {
              e.preventDefault();
              const n = parseInt(targetDraft);
              if (!isNaN(n) && n > 0) onTargetChange("weekly", n);
              setEditingTarget(null);
            }}>
              <input autoFocus type="number" min={1} value={targetDraft}
                onChange={(e) => setTargetDraft(e.target.value)}
                onBlur={() => {
                  const n = parseInt(targetDraft);
                  if (!isNaN(n) && n > 0) onTargetChange("weekly", n);
                  setEditingTarget(null);
                }}
                className="w-16 rounded border border-border bg-background px-1.5 py-0.5 text-xs text-right" />
              <span className="text-[10px]">{area.unitShort}</span>
            </form>
          ) : (
            <button onClick={() => { setTargetDraft(String(targets.weekly)); setEditingTarget("weekly"); }}
              className="hover:underline">cel: {targets.weekly}</button>
          )}
        </div>
      </div>

      {/* History toggle */}
      <button
        onClick={() => setShowHistory((v) => !v)}
        className="mt-4 w-full rounded-lg border border-border py-2 text-center text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50"
      >
        {showHistory ? "Ukryj historie" : `Historia wpisow (${entries.length})`}
      </button>

      {/* History list */}
      {showHistory && (
        <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
          {historyEntries.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">Brak wpisow</p>
          )}
          {historyEntries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2"
            >
              <span className="text-xs text-muted-foreground">{formatDate(entry.date)}</span>
              {editingId === entry.id ? (
                <form className="inline-flex items-center gap-1" onSubmit={(e) => {
                  e.preventDefault();
                  const n = parseInt(editDraft);
                  if (!isNaN(n) && n > 0) onEditEntry(area.key, entry.date, n);
                  setEditingId(null);
                }}>
                  <input autoFocus type="number" min={0} value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    onBlur={() => {
                      const n = parseInt(editDraft);
                      if (!isNaN(n) && n > 0) onEditEntry(area.key, entry.date, n);
                      setEditingId(null);
                    }}
                    className="w-16 rounded border border-border bg-background px-1.5 py-0.5 text-xs text-right" />
                </form>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setEditDraft(String(entry.amount)); setEditingId(entry.id); }}
                    className="text-sm font-semibold transition-colors hover:opacity-70"
                    style={{ color: area.color }}
                  >
                    {entry.amount} {area.unitShort}
                  </button>
                  <button
                    onClick={() => onDeleteEntry(entry.id)}
                    className="rounded p-0.5 text-xs text-muted-foreground transition-colors hover:text-red-500"
                    title="Usun"
                  >
                    &#10005;
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main Page ──────────────────────────────────── */
export default function RozwojPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Targets persisted to Supabase via goalsSync
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
    rozwojTargets: DEFAULT_TARGETS,
    runEntries: [0, 0, 0, 0, 0, 0, 0],
    bikeEntries: [0, 0, 0, 0, 0, 0, 0],
  };
  const { state: gs, setState: setGs } = useGoalsSync(goalsDefaults);
  const targets = gs.rozwojTargets;
  const setTargets = (updater: Targets | ((prev: Targets) => Targets)) => {
    setGs((prev) => ({
      ...prev,
      rozwojTargets: typeof updater === "function" ? updater(prev.rozwojTargets) : updater,
    }));
  };

  // Fetch entries from Supabase
  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch("/api/rozwoj?days=365");
      const data = await res.json();
      if (data.entries) setEntries(data.entries);
    } catch {
      // offline — keep empty
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const addEntry = async (area: AreaKey, date: string, amount: number) => {
    setSaving(true);
    try {
      await fetch("/api/rozwoj", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ area, date, amount }),
      });
      await fetchEntries();
    } catch { /* ignore */ }
    setSaving(false);
  };

  const editEntry = async (area: AreaKey, date: string, amount: number) => {
    setSaving(true);
    try {
      await fetch("/api/rozwoj", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ area, date, amount }),
      });
      await fetchEntries();
    } catch { /* ignore */ }
    setSaving(false);
  };

  const deleteEntry = async (id: string) => {
    setSaving(true);
    try {
      await fetch(`/api/rozwoj?id=${id}`, { method: "DELETE" });
      await fetchEntries();
    } catch { /* ignore */ }
    setSaving(false);
  };

  const updateTarget = (area: AreaKey, field: "monthly" | "weekly", value: number) => {
    setTargets((prev) => ({
      ...prev,
      [area]: { ...prev[area], [field]: value },
    }));
  };

  // Compute totals for summary
  const monthStart = getMonthStart();
  const monthEntries = entries.filter((e) => e.date >= monthStart);

  const areaTotals = AREAS.map((a) => {
    const total = monthEntries.filter((e) => e.area === a.key).reduce((s, e) => s + e.amount, 0);
    const target = targets[a.key].monthly;
    return { ...a, total, target, pct: target > 0 ? Math.round((total / target) * 100) : 0 };
  });

  const overallPct = areaTotals.reduce((s, a) => s + Math.min(a.pct, 100), 0) / AREAS.length;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Ladowanie...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <BackButton />

        {/* Header */}
        <div className="mt-6 text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            Rozwoj Osobisty
          </div>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-foreground sm:text-5xl">
            MARZEC 2026
          </h1>
        </div>

        {/* Summary */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-3 text-center sm:p-4">
            <div className="text-2xl font-black text-purple-600 sm:text-3xl">
              {Math.round(overallPct)}%
            </div>
            <div className="mt-1 text-[10px] font-medium text-purple-400 sm:text-xs">
              Cel miesieczny
            </div>
          </div>
          {areaTotals.map((a) => (
            <div
              key={a.key}
              className="rounded-2xl border p-3 text-center sm:p-4"
              style={{ borderColor: a.colorBorder, background: a.colorLight + "80" }}
            >
              <div className="text-xl sm:text-2xl">{a.icon}</div>
              <div className="mt-0.5 text-xl font-bold sm:text-2xl" style={{ color: a.color }}>
                {a.pct}%
              </div>
              <div className="text-[10px] text-muted-foreground sm:text-xs">
                {a.total}/{a.target} {a.unitShort}
              </div>
            </div>
          ))}
        </div>

        {/* Area Cards */}
        <div className="mt-6 grid gap-4 sm:gap-6">
          {AREAS.map((a) => (
            <AreaCard
              key={a.key}
              area={a}
              entries={entries.filter((e) => e.area === a.key)}
              targets={targets[a.key]}
              onAddEntry={addEntry}
              onEditEntry={editEntry}
              onDeleteEntry={deleteEntry}
              onTargetChange={(field, value) => updateTarget(a.key, field, value)}
              saving={saving}
            />
          ))}
        </div>

        {/* Footer */}
        <p className="mt-10 text-center text-sm italic text-muted-foreground">
          &ldquo;Liderzy sa czytelnikami.&rdquo; &mdash; Harry S. Truman
        </p>
      </div>
    </div>
  );
}
