"use client";

import { useState, useEffect } from "react";
import { BackButton } from "@/components/dashboard/back-button";
import { useLocalStorage } from "@/lib/storage";

/* ── Types ──────────────────────────────────────── */
type AreaConfig = {
  monthlyTarget: number;
  weeklyTarget: number;
  monthlyDone: number;
  weeklyDone: number;
  yearlyTarget: number;
  yearlyDone: number;
  currentTitle: string; // current book title or project
};

type RozwojData = {
  czytanie: AreaConfig;
  sluchanie: AreaConfig;
  pisanie: AreaConfig;
};

const DEFAULT_DATA: RozwojData = {
  czytanie: {
    monthlyTarget: 300,
    weeklyTarget: 75,
    monthlyDone: 0,
    weeklyDone: 0,
    yearlyTarget: 3600,
    yearlyDone: 0,
    currentTitle: "",
  },
  sluchanie: {
    monthlyTarget: 600,
    weeklyTarget: 150,
    monthlyDone: 0,
    weeklyDone: 0,
    yearlyTarget: 7200,
    yearlyDone: 0,
    currentTitle: "",
  },
  pisanie: {
    monthlyTarget: 30,
    weeklyTarget: 8,
    monthlyDone: 0,
    weeklyDone: 0,
    yearlyTarget: 365,
    yearlyDone: 0,
    currentTitle: "",
  },
};

type AreaKey = keyof RozwojData;

const AREAS: {
  key: AreaKey;
  name: string;
  icon: string;
  unit: string;
  unitShort: string;
  color: string;
  colorLight: string;
  colorBorder: string;
  quickAdds: number[];
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
    quickAdds: [5, 10, 25, 50],
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
    quickAdds: [15, 30, 45, 60],
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
    quickAdds: [1, 2, 5, 10],
  },
];

/* ── Editable Number ────────────────────────────── */
function EditableNumber({
  value,
  onSave,
  unit,
  color,
}: {
  value: number;
  onSave: (v: number) => void;
  unit: string;
  color: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  if (editing) {
    return (
      <form
        className="inline-flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          const n = parseInt(draft);
          if (!isNaN(n) && n >= 0) onSave(n);
          setEditing(false);
        }}
      >
        <input
          autoFocus
          type="number"
          min={0}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const n = parseInt(draft);
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
      onClick={() => setEditing(true)}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-sm transition-colors hover:bg-accent"
      title="Kliknij aby edytowac"
    >
      <span className="font-bold" style={{ color }}>
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{unit}</span>
    </button>
  );
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

/* ── Circular Progress ──────────────────────────── */
function CircularProgress({
  current,
  target,
  color,
  size = 90,
}: {
  current: number;
  target: number;
  color: string;
  size?: number;
}) {
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const strokeWidth = 7;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#f3f4f6"
          strokeWidth={strokeWidth}
        />
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
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <span
        className="absolute text-lg font-bold"
        style={{ color }}
      >
        {Math.round(pct)}%
      </span>
    </div>
  );
}

/* ── Area Card ──────────────────────────────────── */
function AreaCard({
  area,
  config,
  onUpdate,
}: {
  area: (typeof AREAS)[number];
  config: AreaConfig;
  onUpdate: (patch: Partial<AreaConfig>) => void;
}) {
  const [customAmount, setCustomAmount] = useState("");
  const monthPct =
    config.monthlyTarget > 0
      ? Math.round((config.monthlyDone / config.monthlyTarget) * 100)
      : 0;
  const weekPct =
    config.weeklyTarget > 0
      ? Math.round((config.weeklyDone / config.weeklyTarget) * 100)
      : 0;

  const addProgress = (amount: number) => {
    onUpdate({
      monthlyDone: config.monthlyDone + amount,
      weeklyDone: config.weeklyDone + amount,
      yearlyDone: config.yearlyDone + amount,
    });
  };

  return (
    <div
      className="rounded-2xl border bg-card p-6 shadow-sm transition-all hover:shadow-md"
      style={{ borderColor: area.colorBorder }}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl text-2xl"
            style={{ background: area.colorLight }}
          >
            {area.icon}
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">{area.name}</h3>
            {config.currentTitle && (
              <p className="text-sm text-muted-foreground italic">
                {config.currentTitle}
              </p>
            )}
          </div>
        </div>
        <CircularProgress
          current={config.monthlyDone}
          target={config.monthlyTarget}
          color={area.color}
        />
      </div>

      {/* Current book/project title */}
      <div className="mt-3">
        <input
          type="text"
          value={config.currentTitle}
          onChange={(e) => onUpdate({ currentTitle: e.target.value })}
          placeholder={
            area.key === "czytanie"
              ? "Jaka ksiazka?"
              : area.key === "sluchanie"
                ? "Jaki audiobook?"
                : "Co piszesz?"
          }
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2"
          style={{ ["--tw-ring-color" as string]: area.color + "40" } as React.CSSProperties}
        />
      </div>

      {/* Monthly progress */}
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Marzec 2026
          </span>
          <span className="text-sm font-medium" style={{ color: area.color }}>
            {config.monthlyDone} / {config.monthlyTarget} {area.unit}
          </span>
        </div>
        <ProgressBar
          current={config.monthlyDone}
          target={config.monthlyTarget}
          color={area.color}
          colorLight={area.colorLight}
          height={12}
        />
        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
          <span>{monthPct}% celu miesiecznego</span>
          <span>
            Zostalo:{" "}
            {Math.max(0, config.monthlyTarget - config.monthlyDone)}{" "}
            {area.unit}
          </span>
        </div>
      </div>

      {/* Weekly progress */}
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Ten tydzien
          </span>
          <span className="text-sm font-medium" style={{ color: area.color }}>
            {config.weeklyDone} / {config.weeklyTarget} {area.unit}
          </span>
        </div>
        <ProgressBar
          current={config.weeklyDone}
          target={config.weeklyTarget}
          color={area.color}
          colorLight={area.colorLight}
          height={8}
        />
        <div className="mt-1 text-right text-xs text-muted-foreground">
          {weekPct}% celu tygodniowego
        </div>
      </div>

      {/* Quick add buttons */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {area.quickAdds.map((n) => (
          <button
            key={n}
            onClick={() => addProgress(n)}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium transition-all hover:shadow-sm active:scale-95"
            style={{
              borderColor: area.colorBorder,
              color: area.color,
              background: area.colorLight,
            }}
          >
            +{n} {area.unitShort}
          </button>
        ))}
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={1}
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            placeholder="..."
            className="w-16 rounded-lg border border-border bg-background px-2 py-1.5 text-center text-sm focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const n = parseInt(customAmount);
                if (!isNaN(n) && n > 0) {
                  addProgress(n);
                  setCustomAmount("");
                }
              }
            }}
          />
          <button
            onClick={() => {
              const n = parseInt(customAmount);
              if (!isNaN(n) && n > 0) {
                addProgress(n);
                setCustomAmount("");
              }
            }}
            className="rounded-lg px-2 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
            style={{ color: area.color }}
          >
            Dodaj
          </button>
        </div>
      </div>

      {/* Target settings */}
      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-dashed border-border p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Cel miesieczny:</span>
          <EditableNumber
            value={config.monthlyTarget}
            onSave={(v) => onUpdate({ monthlyTarget: v })}
            unit={area.unit}
            color={area.color}
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Cel tygodniowy:</span>
          <EditableNumber
            value={config.weeklyTarget}
            onSave={(v) => onUpdate({ weeklyTarget: v })}
            unit={area.unit}
            color={area.color}
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Cel roczny:</span>
          <EditableNumber
            value={config.yearlyTarget}
            onSave={(v) => onUpdate({ yearlyTarget: v })}
            unit={area.unit}
            color={area.color}
          />
        </div>
        <button
          onClick={() =>
            onUpdate({ monthlyDone: 0, weeklyDone: 0 })
          }
          className="ml-auto rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-100"
          title="Resetuj postep miesieczny i tygodniowy"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

/* ── Main Page ──────────────────────────────────── */
export default function RozwojPage() {
  const [rawData, setRawData] = useLocalStorage<RozwojData | null>(
    "dashboard_rozwoj",
    DEFAULT_DATA
  );
  // Merge with defaults to handle old/null localStorage data
  const data: RozwojData = rawData
    ? {
        czytanie: { ...DEFAULT_DATA.czytanie, ...rawData.czytanie },
        sluchanie: { ...DEFAULT_DATA.sluchanie, ...rawData.sluchanie },
        pisanie: { ...DEFAULT_DATA.pisanie, ...rawData.pisanie },
      }
    : DEFAULT_DATA;
  const setData = (updater: (prev: RozwojData) => RozwojData) => {
    setRawData((prev) => updater(prev ?? DEFAULT_DATA));
  };
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const updateArea = (key: AreaKey, patch: Partial<AreaConfig>) => {
    setData((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }));
  };

  // Overall score for the month
  const overallPct =
    AREAS.reduce((sum, a) => {
      const c = data[a.key];
      return sum + (c.monthlyTarget > 0 ? Math.min(c.monthlyDone / c.monthlyTarget, 1) : 0);
    }, 0) / AREAS.length;

  const yearlyPct =
    AREAS.reduce((sum, a) => {
      const c = data[a.key];
      return sum + (c.yearlyTarget > 0 ? Math.min(c.yearlyDone / c.yearlyTarget, 1) : 0);
    }, 0) / AREAS.length;

  if (!mounted) {
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

        {/* Big Month Header */}
        <div className="mt-6 text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            Rozwoj Osobisty
          </div>
          <h1 className="mt-2 text-5xl font-black tracking-tight text-foreground sm:text-6xl">
            MARZEC 2026
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Czytanie &middot; Sluchanie &middot; Pisanie
          </p>
        </div>

        {/* Overall Summary */}
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {/* Monthly progress */}
          <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-4 text-center">
            <div className="text-3xl font-black text-purple-600">
              {Math.round(overallPct * 100)}%
            </div>
            <div className="mt-1 text-xs font-medium text-purple-400">
              Cel miesieczny
            </div>
          </div>

          {/* Areas summary */}
          {AREAS.map((a) => {
            const c = data[a.key];
            const pct =
              c.monthlyTarget > 0
                ? Math.round((c.monthlyDone / c.monthlyTarget) * 100)
                : 0;
            return (
              <div
                key={a.key}
                className="rounded-2xl border p-4 text-center"
                style={{
                  borderColor: a.colorBorder,
                  background: a.colorLight + "80",
                }}
              >
                <div className="text-2xl">{a.icon}</div>
                <div
                  className="mt-1 text-2xl font-bold"
                  style={{ color: a.color }}
                >
                  {pct}%
                </div>
                <div className="text-xs text-muted-foreground">
                  {c.monthlyDone}/{c.monthlyTarget} {a.unitShort}
                </div>
              </div>
            );
          })}
        </div>

        {/* Yearly progress bar */}
        <div className="mt-6 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Postep roczny 2026
            </span>
            <span className="text-sm font-bold text-foreground">
              {Math.round(yearlyPct * 100)}%
            </span>
          </div>
          <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-purple-500 via-sky-500 to-amber-500 transition-all duration-700"
              style={{ width: `${Math.round(yearlyPct * 100)}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            {AREAS.map((a) => {
              const c = data[a.key];
              return (
                <span key={a.key}>
                  {a.icon} {c.yearlyDone}/{c.yearlyTarget} {a.unitShort}
                </span>
              );
            })}
          </div>
        </div>

        {/* Area Cards */}
        <div className="mt-8 grid gap-6 lg:grid-cols-1">
          {AREAS.map((a) => (
            <AreaCard
              key={a.key}
              area={a}
              config={data[a.key]}
              onUpdate={(patch) => updateArea(a.key, patch)}
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
