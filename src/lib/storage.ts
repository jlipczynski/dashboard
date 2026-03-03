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

  // Sync to localStorage only after hydration (prevents overwriting stored data)
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // quota exceeded or private mode – ignore
    }
  }, [key, value, hydrated]);

  return [value, setValue] as const;
}

/**
 * Cached Garmin data stored in localStorage with TTL.
 */
export type CachedGarminData = {
  summary: {
    month: {
      cyclingKm: number;
      cyclingHours: number;
      runningKm: number;
      activeCalories: number;
      gymSessions: number;
    };
    week: {
      cyclingKm: number;
      runningKm: number;
      activeCalories: number;
      gymSessions: number;
      dailyRunning: number[];
      dailyCycling: number[];
    };
  };
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
  syncedAt: string;
};

const GARMIN_CACHE_KEY = "dashboard_garmin_cache";
const GARMIN_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

export function getCachedGarmin(): CachedGarminData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(GARMIN_CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as CachedGarminData;
    const age = Date.now() - new Date(data.syncedAt).getTime();
    if (age > GARMIN_CACHE_TTL) return null; // expired
    return data;
  } catch {
    return null;
  }
}

export function setCachedGarmin(data: CachedGarminData) {
  try {
    localStorage.setItem(GARMIN_CACHE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

/**
 * useGarminSync – manages Garmin data fetching with local cache.
 */
export function useGarminSync() {
  const [data, setData] = useState<CachedGarminData | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load from cache on mount
  useEffect(() => {
    const cached = getCachedGarmin();
    if (cached) setData(cached);
  }, []);

  const sync = useCallback(async (force = false) => {
    if (!force) {
      const cached = getCachedGarmin();
      if (cached) {
        setData(cached);
        return cached;
      }
    }

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
        summary: json.summary,
        activities: json.activities,
        syncedAt: json.syncedAt,
      };
      setCachedGarmin(garminData);
      setData(garminData);
      return garminData;
    } catch {
      setError("Nie udalo sie polaczyc z Garmin");
      return null;
    } finally {
      setSyncing(false);
    }
  }, []);

  return { data, syncing, error, sync };
}

/**
 * useGoalsSync – persists fitness goals to Supabase with localStorage cache.
 * On mount: loads from Supabase (falls back to localStorage).
 * On save: writes to both Supabase and localStorage.
 */
export type GoalsShape = {
  activeCalories: { target: number; current: number; unit: string };
  cycling: { target: number; current: number; unit: string };
  cyclingHours: { target: number; current: number; unit: string };
  running: { target: number; current: number; unit: string };
  competition: { name: string; date: string; type: "running" | "cycling"; distance: number };
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
  if (typeof window === "undefined") return null;
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

export function useGoalsSync(defaults: GoalsSyncState) {
  const [state, setStateRaw] = useState<GoalsSyncState>(defaults);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load from Supabase on mount, fallback to localStorage cache
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // First try localStorage cache for instant display
      const cached = loadGoalsCache();
      if (cached && !cancelled) {
        setStateRaw(mergeWithDefaults(cached, defaults) as GoalsSyncState);
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
        }
      } catch {
        // Supabase unavailable — localStorage cache is fine
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced save to Supabase
  const persistToSupabase = useCallback((next: GoalsSyncState) => {
    saveGoalsCache(next);
    setSaving(true);
    fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goals: next.goals,
        gym_days: next.gymDays,
        gym_weekly_goal: next.gymWeeklyGoal,
        gym_monthly_goal: next.gymMonthlyGoal,
        gym_monthly_done: next.gymMonthlyDone,
        run_weekly_goal: next.runWeeklyGoal,
        run_monthly_goal: next.runMonthlyGoal,
        bike_weekly_goal: next.bikeWeeklyGoal,
        bike_monthly_goal: next.bikeMonthlyGoal,
        rozwoj_targets: next.rozwojTargets,
        run_entries: next.runEntries,
        bike_entries: next.bikeEntries,
      }),
    })
      .catch(() => {})
      .finally(() => setSaving(false));
  }, []);

  const setState = useCallback(
    (updater: GoalsSyncState | ((prev: GoalsSyncState) => GoalsSyncState)) => {
      setStateRaw((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        // Debounce: save 500ms after last change
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => persistToSupabase(next), 500);
        saveGoalsCache(next);
        return next;
      });
    },
    [persistToSupabase]
  );

  return { state, setState, loaded, saving };
}

