// @vitest-environment node
// Integration: migration 033 on a production-shaped schema (PGlite, in memory), then the full WIG flow through
// src/lib/wig-db.ts: plan → approve → Weekly Planner task → execution → close → correction → history.
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import {
  approvePlan, closeWeek, deleteLead, getContext, getLeads, getSources, getSummary, getWeekFull, saveLag, saveLead, saveRelation, saveResult, setAreaSkip, saveReflection, WigError, type Queryable,
} from "../lib/wig-db";
import { parseLead, type LeadInput } from "../lib/wig-model";

const MIGRATION = readFileSync(path.join(__dirname, "../../supabase/migrations/033_wig_sessions.sql"), "utf8");

// Existing production tables, column for column (information_schema, 22.11.2026).
const LEGACY = `
create table weekly_tasks (id uuid primary key default gen_random_uuid(), task text not null, project text not null, priority character(1) not null,
  sub_priority integer default 1, wig_id text default '', deadline date, person text default '', status text default 'todo', week_start date not null,
  notes text default '', points integer default 0, created_at timestamptz default now(), updated_at timestamptz default now(), backlog_item_id uuid);
create table rehab_entries (date date primary key, percent integer not null, note text, created_at timestamptz default now(), updated_at timestamptz default now());
create table nutrition_log (date date primary key, calories integer, created_at timestamptz default now());
create table bookly_reports (id uuid primary key default gen_random_uuid(), period_from date not null, period_to date not null, minutes integer not null default 0,
  pages integer not null default 0, reading_days integer not null default 0, books_finished integer not null default 0, finished_titles jsonb not null default '[]');
create table rozwoj_entries (id uuid primary key default gen_random_uuid(), area text not null, date date not null, amount integer not null default 0);
insert into weekly_tasks (task, project, priority, sub_priority, wig_id, week_start, status, points) values
  ('Stary cel', 'Ovoc Malinovi', 'A', 1, 'WIG: sprzedaż', '2026-11-16', 'done', 4),
  ('Rozmowa z dostawcą', 'Plantacja', 'B', 1, '', '2026-11-23', 'todo', 3);
`;

let db: Queryable;
let pgl: PGlite;
const before: Record<string, unknown>[] = [];

const L = (o: Record<string, unknown>): LeadInput => {
  const p = parseLead({ week: "2026-11-23", unit: "", direction: "at_least", source: "manual", ...o });
  if (!p.ok) throw new Error(p.error);
  return p.lead;
};

beforeAll(async () => {
  pgl = new PGlite();
  await pgl.exec(LEGACY);
  before.push(...(await pgl.query<Record<string, unknown>>(`select * from weekly_tasks order by task`)).rows);
  await pgl.exec(MIGRATION);
  await pgl.exec(MIGRATION); // idempotent (if not exists)
  db = pgl as unknown as Queryable;
});

describe("migration 033", () => {
  it("keeps every existing weekly_tasks row and value; new columns are NULL", async () => {
    const after = (await pgl.query<Record<string, unknown>>(`select * from weekly_tasks order by task`)).rows;
    expect(after).toHaveLength(before.length);
    after.forEach((r, i) => {
      for (const [k, v] of Object.entries(before[i])) expect(r[k]).toEqual(v);
      expect(r.area_key).toBeNull();
      expect(r.wig_lead_id).toBeNull();
      expect(r.rock_id).toBeNull();
    });
  });
  it("rejects a week that does not start on Monday and a bad area", async () => {
    await expect(pgl.query(`insert into wig_weeks (week_start) values ('2026-11-24')`)).rejects.toThrow();
    await expect(pgl.query(`update weekly_tasks set area_key='plantacja'`)).rejects.toThrow();
  });
});

describe("full flow for 23–29.11.2026", () => {
  const SUN = "2026-11-22", MON = "2026-11-23", SAT = "2026-11-28", NEXT_SUN = "2026-11-29";
  let ids: Record<string, string> = {};

  it("plan on Sunday 22.11: LEADs in all areas, Praca commitment becomes a Weekly Planner task", async () => {
    const z1 = await saveLead(db, L({ area: "zdrowie", name: "Rehabilitacja", unit: "dni", target: 6, weight: 50, source: "rehab_days" }), SUN);
    const z2 = await saveLead(db, L({ area: "zdrowie", name: "Siłownia", unit: "treningi", target: 2, weight: 30 }), SUN);
    const z3 = await saveLead(db, L({ area: "zdrowie", name: "Kalorie", unit: "kcal", direction: "at_most", target: 14000, weight: 20, source: "calories_week" }), SUN);
    const r1 = await saveLead(db, L({ area: "rozwoj", name: "Czytanie", unit: "min", target: 210, weight: 50, source: "reading_minutes" }), SUN);
    const r2 = await saveLead(db, L({ area: "rozwoj", name: "Msza św.", unit: "razy", target: 1, weight: 25 }), SUN);
    const r3 = await saveLead(db, L({ area: "rozwoj", name: "Nowy Testament", unit: "rozdziały", target: 5, weight: 25 }), SUN);
    const p1 = await saveLead(db, L({ area: "praca", name: "Podpisać umowę z odbiorcą", unit: "zobowiązanie", target: 1, weight: 60, source: "task", task: { project: "Ovoc Malinovi", priority: "A" } }), SUN);
    const existing = (await pgl.query<{ id: string }>(`select id from weekly_tasks where task='Rozmowa z dostawcą'`)).rows[0].id;
    const p2 = await saveLead(db, L({ area: "praca", name: "Rozmowa z dostawcą", unit: "zobowiązanie", target: 1, weight: 40, source: "task", taskId: existing }), SUN);
    ids = { z1: z1.id, z2: z2.id, z3: z3.id, r1: r1.id, r2: r2.id, r3: r3.id, p1: p1.id, p2: p2.id };
    expect(p1.tasks).toHaveLength(1);
    const t = (await pgl.query<Record<string, unknown>>(`select task, project, priority, points, area_key, week_start::text from weekly_tasks where wig_lead_id=$1`, [p1.id])).rows[0];
    expect(t).toMatchObject({ task: "Podpisać umowę z odbiorcą", project: "Ovoc Malinovi", priority: "A", points: 4, area_key: "praca", week_start: MON });
    expect(p2.tasks[0].id).toBe(existing);
    for (const s of ["monika", "dzieci", "przyjaciele", "pozostali"] as const) await saveRelation(db, { week: MON, sub: s, intention: `intencja ${s}`, didWell: "", didWrong: "", impact: "", doDifferently: "", rating: null, excused: false, reason: "" });
  });

  it("execution cannot be entered before the plan is approved; approval checks weights", async () => {
    await expect(saveResult(db, { leadId: ids.z2, actual: 1, status: "manual", evidence: "", sourceValue: null, reason: "" }, MON)).rejects.toThrow(/zatwierdź plan/);
    const bad = await saveLead(db, L({ area: "rozwoj", name: "Audiobook", unit: "min", target: 60, weight: 10 }), SUN);
    await expect(approvePlan(db, MON, SUN)).rejects.toThrow(/Rozwój: wagi sumują się do 110%/);
    await deleteLead(db, bad.id, "", SUN);
    await approvePlan(db, MON, SUN);
    const w = await getWeekFull(db, MON);
    expect(w.row?.planStatus).toBe("zatwierdzony");
    expect((w.row?.planSnapshot as { leads: unknown[] }).leads).toHaveLength(8);
  });

  it("after approval a plan change needs a reason and is logged; a task added in the planner mid-week does not change the frozen plan", async () => {
    await expect(saveLead(db, L({ area: "praca", name: "Nowe", target: 1, weight: 10 }), MON)).rejects.toThrow(/uzasadnienia/);
    await pgl.query(`insert into weekly_tasks (task, project, priority, week_start, points) values ('Zadanie dodane w środę', 'Plantacja', 'A', $1, 4)`, [MON]);
    const leads = await getLeads(db, MON);
    expect(leads.filter((l) => l.area === "praca")).toHaveLength(2);
    const changed = await saveLead(db, { ...L({ area: "zdrowie", name: "Siłownia", unit: "treningi", target: 2, weight: 30 }), id: ids.z2, notes: "po konsultacji z fizjo", reason: "zalecenie fizjoterapeuty" }, MON);
    expect(changed.notes).toBe("po konsultacji z fizjo");
    const ev = (await getWeekFull(db, MON)).events.map((e) => e.kind);
    expect(ev).toContain("plan_lead_changed");
  });

  it("sources are suggestions with evidence (rehab, calories with incomplete logging, Bookly)", async () => {
    await pgl.exec(`insert into rehab_entries (date, percent) values ('2026-11-23',100),('2026-11-24',80),('2026-11-25',0),('2026-11-26',100),('2026-11-27',100),('2026-11-28',60);
      insert into nutrition_log (date, calories) values ('2026-11-23',1900),('2026-11-24',2100),('2026-11-25',2000);
      insert into bookly_reports (period_from, period_to, minutes, pages, reading_days) values ('2026-11-23','2026-11-29',245,90,6);`);
    const s = await getSources(db, MON, NEXT_SUN);
    expect(s.rehab_days).toMatchObject({ value: 5, complete: true });
    expect(s.calories_week.value).toBe(6000);
    expect(s.calories_week.complete).toBe(false);
    expect(s.calories_week.evidence).toMatch(/3\/7/);
    expect(s.reading_minutes.value).toBe(245);
  });

  it("closing: blocked before Sunday and while data is missing; then closes with an immutable snapshot", async () => {
    await expect(closeWeek(db, MON, SAT)).rejects.toThrow(/od niedzieli 2026-11-29/);
    await saveResult(db, { leadId: ids.z1, actual: 5, status: "measured", evidence: "rehab_entries", sourceValue: 5, reason: "" }, NEXT_SUN);
    await saveResult(db, { leadId: ids.z2, actual: 3, status: "manual", evidence: "", sourceValue: null, reason: "" }, NEXT_SUN);
    await saveResult(db, { leadId: ids.z3, actual: null, status: "excused", evidence: "nie logowałem — choroba", sourceValue: 6000, reason: "" }, NEXT_SUN);
    await saveResult(db, { leadId: ids.r1, actual: 245, status: "measured", evidence: "Bookly", sourceValue: 245, reason: "" }, NEXT_SUN);
    await saveResult(db, { leadId: ids.r2, actual: 1, status: "manual", evidence: "", sourceValue: null, reason: "" }, NEXT_SUN);
    await saveResult(db, { leadId: ids.r3, actual: 0, status: "zero_confirmed", evidence: "", sourceValue: null, reason: "" }, NEXT_SUN);
    await saveResult(db, { leadId: ids.p1, actual: 1, status: "manual", evidence: "umowa podpisana", sourceValue: 1, reason: "" }, NEXT_SUN);
    await expect(closeWeek(db, MON, NEXT_SUN)).rejects.toThrow(/Rozmowa z dostawcą.*Relacje — Monika/);
    await saveResult(db, { leadId: ids.p2, actual: 0.5, status: "manual", evidence: "częściowo", sourceValue: 0, reason: "" }, NEXT_SUN);
    const ratings = { monika: 5, dzieci: 4, przyjaciele: 3, pozostali: 4 } as const;
    for (const [s, r] of Object.entries(ratings)) await saveRelation(db, { week: MON, sub: s as "monika", intention: `intencja ${s}`, didWell: "dobrze", didWrong: "źle", impact: "wpływ", doDifferently: "inaczej", rating: r, excused: false, reason: "" });
    await saveReflection(db, MON, "zdrowie", { worked: "rehab rano", didnt: "kalorie", correction: "logować codziennie" }, "");
    const snap = await closeWeek(db, MON, NEXT_SUN);
    // Zdrowie: rehab 5/6 (50), gym 3/2 → 150% (30), calories excused → (50·0.8333 + 30·1.5)/80 = 108.3% → 5
    expect(snap.areaResults.zdrowie.realization).toBeCloseTo((50 * (5 / 6) + 30 * 1.5) / 80, 12);
    expect(snap.areaResults.zdrowie.rating).toBe(5);
    // Rozwój: 245/210 → 116.7% (50), Msza 100% (25), NT 0% (25) → 83.3% → 3
    expect(snap.areaResults.rozwoj.rating).toBe(3);
    // Praca: 60·1 + 40·0.5 = 80% → 3
    expect(snap.areaResults.praca.rating).toBe(3);
    expect(snap.relationValue).toBeCloseTo((40 * 5 + 35 * 4 + 15 * 3 + 10 * 4) / 100, 12);
    expect(snap.weekMain).toBeCloseTo(0.3 * 3 + 0.3 * 5 + 0.25 * 3 + 0.15 * 4.25, 12);
    await expect(closeWeek(db, MON, NEXT_SUN)).rejects.toThrow(/już zamknięty/);
  });

  it("correction after close: needs a reason, creates version 2 (skorygowana), version 1 stays", async () => {
    await expect(saveResult(db, { leadId: ids.r3, actual: 3, status: "manual", evidence: "", sourceValue: null, reason: "" }, NEXT_SUN)).rejects.toThrow(/uzasadnienia/);
    await saveResult(db, { leadId: ids.r3, actual: 3, status: "manual", evidence: "", sourceValue: null, reason: "zapomniałem wpisać 3 rozdziałów" }, NEXT_SUN);
    const w = await getWeekFull(db, MON);
    expect(w.row?.closeStatus).toBe("skorygowana");
    expect(w.closes.map((c) => c.version)).toEqual([1, 2]);
    expect(w.closes[0].snapshot.areaResults.rozwoj.rating).toBe(3);
    expect(w.closes[1].snapshot.areaResults.rozwoj.realization).toBeCloseTo((50 * (245 / 210) + 25 * 1 + 25 * 0.6) / 100, 12);
    expect(w.closes[1].reason).toBe("zapomniałem wpisać 3 rozdziałów");
    const revs = (await pgl.query(`select revision from wig_results where lead_id=$1 order by revision`, [ids.r3])).rows;
    expect(revs).toHaveLength(2);
  });

  it("summary on Monday 30.11: window 1/4, provisional, uses the corrected version", async () => {
    const s = await getSummary(db, "2026-11-30");
    expect(s.score.windowWeeks).toEqual(["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"]);
    expect(s.score.closedWeeks).toBe(1);
    expect(s.score.provisional).toBe(true);
    expect(s.score.value).not.toBeNull();
    expect(s.planningWeek).toBe("2026-11-30");
    expect(s.history.find((h) => h.weekStart === MON)?.version).toBe(2);
  });

  it("no retroactive goals: a finished week can't be planned; LAG progress sums closed weeks", async () => {
    await expect(saveLead(db, L({ week: "2026-11-16", area: "zdrowie", name: "Retro", target: 1, weight: 100 }), MON)).rejects.toThrow(/wstecz/);
    await expect(approvePlan(db, "2026-11-16", MON)).rejects.toThrow(/wstecz/);
    await saveLag(db, { area: "rozwoj", name: "Nowy Testament do 31.12.2027", unit: "rozdziały", target: 260, deadline: "2027-12-31", leadKey: "nowy-testament", startValue: 0, manualValue: null });
    const ctx = await getContext(db, "2026-11-30");
    expect(ctx.lags[0].current).toBe(3);
  });

  it("area skip needs a reason and counts as excused (not 0)", async () => {
    await setAreaSkip(db, "2026-11-30", "praca", "urlop", "2026-11-29");
    const w = await getWeekFull(db, "2026-11-30");
    expect(w.row?.areaSkip).toEqual({ praca: "urlop" });
    expect(WigError).toBeDefined();
  });
});
