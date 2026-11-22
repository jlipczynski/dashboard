"use client";
// Client helpers for /api/wig. Every write returns a clear error message (never silently ignored).
import type { AreaWindow, MainScore } from "@/lib/wig-score";

export type ResultT = { revision: number; actual: number | null; status: "measured" | "manual" | "zero_confirmed" | "excused"; evidence: string; sourceValue: number | null; reason: string; createdAt: string } | null;
export type LeadT = {
  id: string; weekStart: string; area: "rozwoj" | "zdrowie" | "praca"; leadKey: string; name: string; unit: string; direction: "at_least" | "at_most" | "range";
  target: number; targetMax: number | null; weight: number; source: string; notes: string; position: number; result: ResultT;
  tasks: { id: string; task: string; status: string; project: string; priority: string }[];
};
export type RelationT = { sub: "monika" | "dzieci" | "przyjaciele" | "pozostali"; revision: number; intention: string; didWell: string; didWrong: string; impact: string; doDifferently: string; rating: number | null; excused: boolean; reason: string };
export type WeekRowT = {
  weekStart: string; planStatus: "robocza" | "zatwierdzony"; planApprovedAt: string | null; areaSkip: Record<string, string>;
  reflection: Record<string, { worked?: string; didnt?: string; correction?: string }>; closeStatus: "zamknieta" | "skorygowana" | null; closedAt: string | null;
};
export type CloseT = { version: number; closedAt: string; reason: string; algorithm: string; snapshot: { areaResults: Record<string, { realization: number | null; rating: number | null }>; relationValue: number | null; weekMain: number | null } };
export type WeekData = {
  week: string; today: string; row: WeekRowT | null; leads: LeadT[]; relations: RelationT[]; closes: CloseT[]; blockers: string[];
  events: { kind: string; reason: string; created_at: string }[];
  weekTasks: { id: string; task: string; status: string; project: string; priority: string; wig_lead_id: string | null }[];
};
export type HistoryT = { weekStart: string; planStatus: string; closeStatus: string | null; version: number | null; weekMain: number | null; areaResults: Record<string, { realization: number | null; rating: number | null }> | null; relationValue: number | null; reflection: WeekRowT["reflection"] };
export type SummaryT = { today: string; currentWeek: string; planningWeek: string; planningStatus: string | null; score: MainScore; history: HistoryT[] };
export type SourcesT = Record<string, { value: number | null; evidence: string; complete: boolean }>;
export type ContextT = {
  context: Record<string, string>;
  lags: { id: string; area: string; name: string; unit: string; target: number | null; deadline: string | null; leadKey: string | null; startValue: number; manualValue: number | null; current: number }[];
  monthly: { id: string; month: string; area: string; name: string; unit: string; target: number | null; leadKey: string | null; manualValue: number | null; current: number | null }[];
  rocks: { id: string; quarter: string; area: string; title: string; owner: string; milestone: string; due: string | null; status: string; wig: string }[];
};
export type { AreaWindow };

async function parse<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || `HTTP ${res.status}`);
  return json as T;
}

export const wigGet = <T,>(params: Record<string, string>) => fetch(`/api/wig?${new URLSearchParams(params)}`, { cache: "no-store" }).then((r) => parse<T>(r));
export const wigPost = <T = { status: string },>(body: Record<string, unknown>) =>
  fetch("/api/wig", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => parse<T>(r));

export const ratingColor = (v: number | null) =>
  v === null ? "#9ca3af" : v >= 4.5 ? "#16a34a" : v >= 3.5 ? "#65a30d" : v >= 2.5 ? "#d97706" : "#dc2626";
