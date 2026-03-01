"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * React hook that persists state in localStorage.
 * Falls back to initialValue on SSR or when localStorage is unavailable.
 */
export function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(initialValue);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage after mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored) setValue(JSON.parse(stored) as T);
    } catch {
      // ignore
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
