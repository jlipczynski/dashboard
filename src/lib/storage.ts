"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Deep-merge stored object with defaults so new/missing fields are filled in.
 * Primitives, arrays, and null stored values fall back to the default.
 */
function mergeWithDefaults<T>(stored: unknown, defaults: T): T {
  if (
    defaults === null ||
    defaults === undefined ||
    typeof defaults !== "object" ||
    Array.isArray(defaults)
  ) {
    return (stored ?? defaults) as T;
  }
  if (stored === null || stored === undefined || typeof stored !== "object" || Array.isArray(stored)) {
    return defaults;
  }
  const result = { ...defaults } as Record<string, unknown>;
  for (const key of Object.keys(defaults as Record<string, unknown>)) {
    result[key] = mergeWithDefaults(
      (stored as Record<string, unknown>)[key],
      (defaults as Record<string, unknown>)[key]
    );
  }
  // Keep extra keys from stored data that aren't in defaults
  for (const key of Object.keys(stored as Record<string, unknown>)) {
    if (!(key in result)) {
      result[key] = (stored as Record<string, unknown>)[key];
    }
  }
  return result as T;
}

/**
 * React hook that persists state in localStorage.
 * Stored data is deep-merged with initialValue so missing/new fields
 * always get their defaults — no more crashes from stale shapes.
 */
export function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(initialValue);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage after mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        setValue(mergeWithDefaults(parsed, initialValue) as T);
      }
    } catch {
      // ignore – keep initialValue
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Persist to localStorage on change (after hydration)
  useEffect(() => {
    if (hydrated) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // ignore – localStorage might be full
      }
    }
  }, [key, value, hydrated]);

  return [value, setValue, hydrated] as const;
}

/* ── Garmin sync ──────────────────────────────────────────────── */

export type CachedGarminData = {
  activities: {
    id: number;
    name: string;
    type: string;
    distanceKm: number;
    durationMin: number;
    calories: number;
    date: string;
    avgHR?: number;
  }[];
  summary: {
    month: {
      cyclingKm: number;
      runningKm: number;
      activeCalories: number;
      gymSessions: number;
    };
    week: {
      cyclingKm: number;
      runningKm: number;
      activeCalories: number;
      gymSessions: number;
      dailyRunning?: number[];
      dailyCycling?: number[];
      dailyGym?: boolean[];
    };
  };
  lastSyncISO: string;
};

const GARMIN_CACHE_KEY = "dashboard_garmin_cache";
const GARMIN_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function loadGarminCache(): CachedGarminData | null {
  try {
    const raw = localStorage.getItem(GARMIN_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Check TTL
    if (Date.now() - new Date(parsed.lastSyncISO).getTime() > GARMIN_CACHE_TTL) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveGarminCache(data: CachedGarminData) {
  try {
    localStorage.setItem(GARMIN_CACHE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

/**
 * Hook that manages Garmin data with localStorage caching.
 */
export function useGarminSync() {
  const [data, setData] = useState<CachedGarminData | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load from cache on mount
  useEffect(() => {
    const cached = loadGarminCache();
    if (cached) setData(cached);
  }, []);

  const sync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/garmin");
      const json = await res.json();
      if (json.error) {
        setError(json.error);
        return null;
      }
      const garminData: CachedGarminData = {
        activities: json.activities,
        summary: json.summary,
        lastSyncISO: new Date().toISOString(),
      };
      setData(garminData);
      saveGarminCache(garminData);
      return garminData;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
      return null;
    } finally {
      setSyncing(false);
    }
  }, []);

  return { data, syncing, error, sync };
}

/* ── Goals sync (Supabase-backed with PATCH semantics) ──────── */

export type GoalsShape = {
  activeCalories: { target: number; current: number; unit: string };
  cycling: { target: number; current: number; unit: string };
  running: { target: number; current: number; unit: string };
  competition: { name: string; date: string; type: "running" | "cycling"; distance: number };
  competitions: { name: string; date: string; type: "running" | "cycling"; distance: number }[];
};

export type RozwojTargets = {
  czytanie: { monthly: number; weekly: number };
  sluchanie: { monthly: number; weekly: number };
  pisanie: { monthly: number; weekly: number };
};

export type GoalsSyncState = {
  goals: GoalsShape;
  gymDays: boolean[];
  gymWeeklyGoal: number;
  gymMonthlyGoal: number;
  gymMonthlyDone: number;
  runWeeklyGoal: number;
  runMonthlyGoal: number;
  bikeWeeklyGoal: number;
  bikeMonthlyGoal: number;
  rozwojTargets: RozwojTargets;
  runEntries: number[];
  bikeEntries: number[];
};

const GOALS_CACHE_KEY = "dashboard_goals_v2";

function loadGoalsCache(): GoalsSyncState | null {
  try {
    const raw = localStorage.getItem(GOALS_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveGoalsCache(state: GoalsSyncState) {
  try {
    localStorage.setItem(GOALS_CACHE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

/**
 * Maps GoalsSyncState keys to their Supabase column names.
 * Used to build PATCH payloads with only changed fields.
 */
const STATE_TO_DB: Record<string, string> = {
  goals: "goals",
  gymDays: "gym_days",
  gymWeeklyGoal: "gym_weekly_goal",
  gymMonthlyGoal: "gym_monthly_goal",
  gymMonthlyDone: "gym_monthly_done",
  runWeeklyGoal: "run_weekly_goal",
  runMonthlyGoal: "run_monthly_goal",
  bikeWeeklyGoal: "bike_weekly_goal",
  bikeMonthlyGoal: "bike_monthly_goal",
  rozwojTargets: "rozwoj_targets",
  runEntries: "run_entries",
  bikeEntries: "bike_entries",
};

/**
 * Detect which top-level keys changed between prev and next state.
 */
function changedKeys(prev: GoalsSyncState, next: GoalsSyncState): string[] {
  const keys: string[] = [];
  for (const k of Object.keys(STATE_TO_DB)) {
    const p = prev[k as keyof GoalsSyncState];
    const n = next[k as keyof GoalsSyncState];
    if (JSON.stringify(p) !== JSON.stringify(n)) {
      keys.push(k);
    }
  }
  return keys;
}

export function useGoalsSync(defaults: GoalsSyncState) {
  const [state, setStateRaw] = useState<GoalsSyncState>(defaults);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);
  // Snapshot of state after load — used to diff for PATCH
  const baselineRef = useRef<GoalsSyncState>(defaults);

  // Load from Supabase on mount, fallback to localStorage cache
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // First try localStorage cache for instant display
      const cached = loadGoalsCache();
      if (cached && !cancelled) {
        const merged = mergeWithDefaults(cached, defaults) as GoalsSyncState;
        setStateRaw(merged);
        baselineRef.current = merged;
      }

      // Then load from Supabase (source of truth)
      try {
        const res = await fetch("/api/goals");
        const json = await res.json();
        if (!cancelled && json.data) {
          const fromDb: GoalsSyncState = {
            goals: mergeWithDefaults(json.data.goals, defaults.goals) as GoalsShape,
            gymDays: json.data.gym_days ?? defaults.gymDays,
            gymWeeklyGoal: json.data.gym_weekly_goal ?? defaults.gymWeeklyGoal,
            gymMonthlyGoal: json.data.gym_monthly_goal ?? defaults.gymMonthlyGoal,
            gymMonthlyDone: json.data.gym_monthly_done ?? defaults.gymMonthlyDone,
            runWeeklyGoal: json.data.run_weekly_goal ?? defaults.runWeeklyGoal,
            runMonthlyGoal: json.data.run_monthly_goal ?? defaults.runMonthlyGoal,
            bikeWeeklyGoal: json.data.bike_weekly_goal ?? defaults.bikeWeeklyGoal,
            bikeMonthlyGoal: json.data.bike_monthly_goal ?? defaults.bikeMonthlyGoal,
            rozwojTargets: mergeWithDefaults(json.data.rozwoj_targets, defaults.rozwojTargets) as RozwojTargets,
            runEntries: json.data.run_entries ?? defaults.runEntries,
            bikeEntries: json.data.bike_entries ?? defaults.bikeEntries,
          };
          setStateRaw(fromDb);
          saveGoalsCache(fromDb);
          baselineRef.current = fromDb;
        }
      } catch {
        // Supabase unavailable — localStorage cache is fine
      }
      if (!cancelled) {
        setLoaded(true);
        loadedRef.current = true;
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // PATCH: only send fields that actually changed since last save
  const persistToSupabase = useCallback((next: GoalsSyncState) => {
    const changed = changedKeys(baselineRef.current, next);
    if (changed.length === 0) return; // nothing to save

    const patch: Record<string, unknown> = {};
    for (const k of changed) {
      patch[STATE_TO_DB[k]] = next[k as keyof GoalsSyncState];
    }

    saveGoalsCache(next);
    setSaving(true);
    fetch("/api/goals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
      .then((res) => {
        if (res.ok) {
          baselineRef.current = next;
        }
      })
      .catch(() => {})
      .finally(() => setSaving(false));
  }, []);

  const setState = useCallback(
    (updater: GoalsSyncState | ((prev: GoalsSyncState) => GoalsSyncState)) => {
      setStateRaw((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        saveGoalsCache(next);
        // Only persist AFTER initial load — prevents overwriting real data with defaults
        if (loadedRef.current) {
          if (saveTimer.current) clearTimeout(saveTimer.current);
          saveTimer.current = setTimeout(() => persistToSupabase(next), 500);
        }
        return next;
      });
    },
    [persistToSupabase]
  );

  return { state, setState, loaded, saving };
}
