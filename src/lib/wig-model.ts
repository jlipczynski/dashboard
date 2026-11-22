// WIG Sessions 1.0: input validation and small pure helpers shared by the API and the UI.
import type { AreaKey, Direction, ResultStatus, SubKey } from "./wig-score";
import { addDaysIso, isoDayOfWeek, weekStartIso } from "./dates";

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const LEAD_AREAS = ["rozwoj", "zdrowie", "praca"] as const;
export type LeadArea = (typeof LEAD_AREAS)[number];
export const ALL_AREAS: AreaKey[] = ["rozwoj", "zdrowie", "praca", "relacje"];
export const SUB_KEYS: SubKey[] = ["monika", "dzieci", "przyjaciele", "pozostali"];
export const DIRECTIONS: Direction[] = ["at_least", "at_most", "range"];
export const STATUSES: ResultStatus[] = ["measured", "manual", "zero_confirmed", "excused"];
export const SOURCES = ["manual", "rehab_days", "calories_week", "reading_minutes", "audiobook_minutes", "garmin_strength", "garmin_cycling", "garmin_running", "task"] as const;
export type LeadSource = (typeof SOURCES)[number];

export const SOURCE_LABEL: Record<LeadSource, string> = {
  manual: "ręcznie",
  rehab_days: "Rehabilitacja (dni z wpisem)",
  calories_week: "Kalorie — suma tygodnia",
  reading_minutes: "Bookly — minuty czytania",
  audiobook_minutes: "Słuchanie — minuty",
  garmin_strength: "Garmin — siłownia (treningi)",
  garmin_cycling: "Garmin — rower (treningi)",
  garmin_running: "Garmin — bieganie (treningi)",
  task: "Zadanie w Weekly Plannerze",
};
export const DIRECTION_LABEL: Record<Direction, string> = { at_least: "co najmniej", at_most: "najwyżej (limit)", range: "w zakresie" };
export const STATUS_LABEL: Record<ResultStatus, string> = { measured: "ze źródła", manual: "ręcznie", zero_confirmed: "0 potwierdzone", excused: "usprawiedliwione" };

/** Stable LEAD id from its name ("Msza św." → "msza-sw"). */
export function leadKeyFrom(name: string): string {
  const map: Record<string, string> = { ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z" };
  const k = name
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (c) => map[c])
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return k || "lead";
}

export function isMonday(iso: string): boolean {
  return DATE_RE.test(iso) && isoDayOfWeek(iso) === 1;
}

export const weekEnd = (weekStart: string) => addDaysIso(weekStart, 6);

/** The week a session plans: on Sunday the coming week, on Monday–Saturday the current one. */
export const planningWeekFor = (today: string) => weekStartIso(addDaysIso(today, 1));

/** A week can be closed from its Sunday on. */
export const canCloseOn = (weekStart: string, today: string) => today >= weekEnd(weekStart);

/** The plan can be edited until the week is over (no retroactive goals). */
export const canPlanOn = (weekStart: string, today: string) => today <= weekEnd(weekStart);

export type LeadInput = {
  id?: string;
  week: string;
  area: LeadArea;
  leadKey?: string;
  name: string;
  unit: string;
  direction: Direction;
  target: number;
  targetMax: number | null;
  weight: number;
  source: LeadSource;
  notes: string;
  position: number;
  taskId?: string | null;
  task?: { project: string; priority: string } | null; // praca: create a new Weekly Planner task
  reason: string;
};

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.replace(",", ".")) : NaN);
const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function parseLead(b: Record<string, unknown>): { ok: true; lead: LeadInput } | { ok: false; error: string } {
  const week = str(b.week);
  if (!isMonday(week)) return { ok: false, error: "Tydzień musi zaczynać się w poniedziałek (YYYY-MM-DD)" };
  const area = str(b.area) as LeadArea;
  if (!LEAD_AREAS.includes(area)) return { ok: false, error: "Nieznany obszar" };
  const name = str(b.name, 120);
  if (!name) return { ok: false, error: "Podaj nazwę LEAD-a" };
  const direction = (str(b.direction) || "at_least") as Direction;
  if (!DIRECTIONS.includes(direction)) return { ok: false, error: "Nieznany kierunek miary" };
  const target = num(b.target);
  if (!(target > 0)) return { ok: false, error: `„${name}”: cel musi być większy od 0` };
  const tmRaw = b.targetMax;
  const targetMax = direction === "range" ? num(tmRaw) : null;
  if (direction === "range" && !(targetMax !== null && targetMax >= target)) return { ok: false, error: `„${name}”: górna granica zakresu musi być ≥ dolnej` };
  const weight = num(b.weight);
  if (!(weight > 0 && weight <= 100)) return { ok: false, error: `„${name}”: waga musi być od 1 do 100%` };
  const source = (str(b.source) || "manual") as LeadSource;
  if (!SOURCES.includes(source)) return { ok: false, error: "Nieznane źródło danych" };
  if (source === "task" && area !== "praca") return { ok: false, error: "Źródło „zadanie” jest tylko dla Pracy" };
  const leadKey = str(b.leadKey, 60) || leadKeyFrom(name);
  if (!/^[a-z0-9-]{1,60}$/.test(leadKey)) return { ok: false, error: "Nieprawidłowy identyfikator LEAD-a" };
  const id = str(b.id, 40) || undefined;
  const taskId = str(b.taskId, 40) || null;
  const t = b.task as Record<string, unknown> | null | undefined;
  const task = t && typeof t === "object" ? { project: str(t.project, 60) || "Inne", priority: "ABCDE".includes(str(t.priority)) && str(t.priority) ? str(t.priority) : "A" } : null;
  return {
    ok: true,
    lead: { id, week, area, leadKey, name, unit: str(b.unit, 30), direction, target, targetMax, weight, source, notes: str(b.notes, 500), position: Number.isInteger(b.position) ? (b.position as number) : 0, taskId, task, reason: str(b.reason, 500) },
  };
}

export type ResultInput = { leadId: string; actual: number | null; status: ResultStatus; evidence: string; sourceValue: number | null; reason: string };
export function parseResult(b: Record<string, unknown>): { ok: true; result: ResultInput } | { ok: false; error: string } {
  const leadId = str(b.leadId, 40);
  if (!leadId) return { ok: false, error: "Brak LEAD-a" };
  const status = str(b.status) as ResultStatus;
  if (!STATUSES.includes(status)) return { ok: false, error: "Wybierz status: wartość, 0 potwierdzone albo usprawiedliwione" };
  let actual: number | null = num(b.actual);
  if (status === "zero_confirmed") actual = 0;
  else if (status === "excused") actual = null;
  else if (!(actual >= 0)) return { ok: false, error: "Wpisz wykonanie (liczba ≥ 0)" };
  if (status === "excused" && !str(b.evidence)) return { ok: false, error: "Podaj powód usprawiedliwienia" };
  const sv = num(b.sourceValue);
  return { ok: true, result: { leadId, actual, status, evidence: str(b.evidence, 500), sourceValue: Number.isFinite(sv) ? sv : null, reason: str(b.reason, 500) } };
}

export type RelationInput = { week: string; sub: SubKey; intention: string; didWell: string; didWrong: string; impact: string; doDifferently: string; rating: number | null; excused: boolean; reason: string };
export function parseRelation(b: Record<string, unknown>): { ok: true; rel: RelationInput } | { ok: false; error: string } {
  const week = str(b.week);
  if (!isMonday(week)) return { ok: false, error: "Nieprawidłowy tydzień" };
  const sub = str(b.sub) as SubKey;
  if (!SUB_KEYS.includes(sub)) return { ok: false, error: "Nieznany podobszar" };
  const r = b.rating === null || b.rating === undefined || b.rating === "" ? null : num(b.rating);
  if (r !== null && !(Number.isInteger(r) && r >= 1 && r <= 6)) return { ok: false, error: "Samoocena 1–6" };
  return {
    ok: true,
    rel: { week, sub, intention: str(b.intention), didWell: str(b.didWell), didWrong: str(b.didWrong), impact: str(b.impact), doDifferently: str(b.doDifferently), rating: r, excused: b.excused === true, reason: str(b.reason, 500) },
  };
}

/** Weights of each numeric area must add up to 100% (unless the area is skipped this week). */
export function weightProblems(leads: { area: string; weight: number }[], skipped: Partial<Record<string, string>>): string[] {
  const out: string[] = [];
  const names: Record<LeadArea, string> = { rozwoj: "Rozwój", zdrowie: "Zdrowie", praca: "Praca" };
  for (const a of LEAD_AREAS) {
    if (skipped[a]) continue;
    const ls = leads.filter((l) => l.area === a);
    if (ls.length === 0) { out.push(`${names[a]}: dodaj co najmniej jeden LEAD albo oznacz obszar „bez celów w tym tygodniu” z powodem`); continue; }
    const sum = ls.reduce((s, l) => s + l.weight, 0);
    if (Math.abs(sum - 100) > 0.01) out.push(`${names[a]}: wagi sumują się do ${Math.round(sum * 100) / 100}%, a muszą do 100%`);
  }
  return out;
}

export const quarterOf = (iso: string) => `${iso.slice(0, 4)}-Q${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1}`;
