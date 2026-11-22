// WIG Sessions 1.0: data access. Every function takes a Queryable (pg.Client in the API, PGlite in tests).
// Writes are append-only where history matters (results, relation reviews, closes). Corrections after a close
// require a reason and produce a new close version (status "skorygowana"); earlier versions stay.
import { addDaysIso, weekStartIso } from "./dates";
import {
  ALGORITHM_VERSION, AREA_WEIGHTS, RELATION_SUBS, mainScore, weekAreaResult, weekRelationResult, windowWeekStarts,
  type AreaKey, type ClosedWeek, type LeadInstance, type RelationRating, type ResultStatus, type SubKey,
} from "./wig-score";
import { LEAD_AREAS, canCloseOn, canPlanOn, planningWeekFor, weekEnd, weightProblems, type LeadArea, type LeadInput, type RelationInput, type ResultInput } from "./wig-model";
import { dailyValues, type BooklyReport } from "./reading";

export type Queryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
export class WigError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const PRIORITY_POINTS: Record<string, number> = { A: 4, B: 3, C: 2, D: 1, E: 0 }; // same as WeeklyPlanner PRIORITY_META

export type WeekRow = {
  weekStart: string; planStatus: "robocza" | "zatwierdzony"; planApprovedAt: string | null; planSnapshot: unknown;
  areaSkip: Record<string, string>; reflection: Record<string, { worked?: string; didnt?: string; correction?: string }>;
  closeStatus: "zamknieta" | "skorygowana" | null; closedAt: string | null;
};
export type LeadRow = {
  id: string; weekStart: string; area: LeadArea; leadKey: string; name: string; unit: string; direction: LeadInstance["direction"];
  target: number; targetMax: number | null; weight: number; source: string; notes: string; position: number;
  result: { revision: number; actual: number | null; status: ResultStatus; evidence: string; sourceValue: number | null; reason: string; createdAt: string } | null;
  tasks: { id: string; task: string; status: string; project: string; priority: string }[];
};
export type RelationRow = {
  sub: SubKey; revision: number; intention: string; didWell: string; didWrong: string; impact: string; doDifferently: string;
  rating: number | null; excused: boolean; reason: string; createdAt: string;
};
export type CloseRow = { version: number; closedAt: string; reason: string; algorithm: string; snapshot: Snapshot };
export type Snapshot = ClosedWeek & {
  algorithm: string; areaWeights: Record<AreaKey, number>; relationWeights: Record<SubKey, number>;
  areaResults: Record<LeadArea, { realization: number | null; rating: number | null }>; relationValue: number | null;
  weekMain: number | null; reflection: WeekRow["reflection"]; areaSkip: Record<string, string>;
  leadDetails: { leadKey: string; source: string; evidence: string; sourceValue: number | null; revision: number; tasks: string[] }[];
};

function mapWeek(r: Record<string, unknown>): WeekRow {
  return {
    weekStart: r.week_start as string, planStatus: r.plan_status as WeekRow["planStatus"], planApprovedAt: (r.plan_approved_at as string) ?? null,
    planSnapshot: r.plan_snapshot ?? null, areaSkip: (r.area_skip as WeekRow["areaSkip"]) ?? {}, reflection: (r.reflection as WeekRow["reflection"]) ?? {},
    closeStatus: (r.close_status as WeekRow["closeStatus"]) ?? null, closedAt: (r.closed_at as string) ?? null,
  };
}
const WEEK_COLS = `to_char(week_start,'YYYY-MM-DD') as week_start, plan_status, plan_approved_at::text, plan_snapshot, area_skip, reflection, close_status, closed_at::text`;

export async function getWeekRow(db: Queryable, week: string): Promise<WeekRow | null> {
  const { rows } = await db.query(`select ${WEEK_COLS} from wig_weeks where week_start = $1`, [week]);
  return rows[0] ? mapWeek(rows[0]) : null;
}

async function ensureWeek(db: Queryable, week: string): Promise<WeekRow> {
  await db.query(`insert into wig_weeks (week_start) values ($1) on conflict (week_start) do nothing`, [week]);
  return (await getWeekRow(db, week)) as WeekRow;
}

export async function getLeads(db: Queryable, week: string): Promise<LeadRow[]> {
  const { rows } = await db.query(
    `select l.id, to_char(l.week_start,'YYYY-MM-DD') as week_start, l.area_key, l.lead_key, l.name, l.unit, l.direction, l.target, l.target_max,
            l.weight, l.source, l.notes, l.position,
            r.revision, r.actual, r.status, r.evidence, r.source_value, r.reason, r.created_at::text as r_created
       from wig_leads l
       left join lateral (select * from wig_results x where x.lead_id = l.id order by x.revision desc limit 1) r on true
      where l.week_start = $1
      order by l.area_key, l.position, l.created_at`,
    [week]
  );
  const ids = rows.map((r) => r.id as string);
  const tasks = ids.length
    ? (await db.query(`select id, task, status, project, priority, wig_lead_id from weekly_tasks where wig_lead_id = any($1::uuid[]) order by created_at`, [ids])).rows
    : [];
  return rows.map((r) => ({
    id: r.id as string, weekStart: r.week_start as string, area: r.area_key as LeadArea, leadKey: r.lead_key as string, name: r.name as string,
    unit: r.unit as string, direction: r.direction as LeadRow["direction"], target: Number(r.target), targetMax: n(r.target_max), weight: Number(r.weight),
    source: r.source as string, notes: r.notes as string, position: Number(r.position),
    result: r.revision === null || r.revision === undefined ? null : {
      revision: Number(r.revision), actual: n(r.actual), status: r.status as ResultStatus, evidence: r.evidence as string,
      sourceValue: n(r.source_value), reason: r.reason as string, createdAt: r.r_created as string,
    },
    tasks: tasks.filter((t) => t.wig_lead_id === r.id).map((t) => ({ id: t.id as string, task: t.task as string, status: t.status as string, project: t.project as string, priority: String(t.priority).trim() })),
  }));
}

export async function getRelations(db: Queryable, week: string): Promise<RelationRow[]> {
  const { rows } = await db.query(
    `select distinct on (sub_key) sub_key, revision, intention, did_well, did_wrong, impact, do_differently, rating, excused, reason, created_at::text
       from wig_relation_reviews where week_start = $1 order by sub_key, revision desc`,
    [week]
  );
  return rows.map((r) => ({
    sub: r.sub_key as SubKey, revision: Number(r.revision), intention: r.intention as string, didWell: r.did_well as string, didWrong: r.did_wrong as string,
    impact: r.impact as string, doDifferently: r.do_differently as string, rating: n(r.rating), excused: r.excused === true, reason: r.reason as string, createdAt: r.created_at as string,
  }));
}

export async function getCloses(db: Queryable, week: string): Promise<CloseRow[]> {
  const { rows } = await db.query(`select version, closed_at::text, reason, algorithm_version, snapshot from wig_week_closes where week_start = $1 order by version`, [week]);
  return rows.map((r) => ({ version: Number(r.version), closedAt: r.closed_at as string, reason: r.reason as string, algorithm: r.algorithm_version as string, snapshot: r.snapshot as Snapshot }));
}

export async function getWeekFull(db: Queryable, week: string) {
  // Sequential on purpose: one pg client must not run overlapping queries (deprecated in pg, removed in pg@9).
  const row = await getWeekRow(db, week);
  const leads = await getLeads(db, week);
  const relations = await getRelations(db, week);
  const closes = await getCloses(db, week);
  const events = (await db.query(`select kind, payload, reason, created_at::text from wig_events where week_start = $1 order by created_at`, [week])).rows;
  return { week, row, leads, relations, closes, events };
}

async function event(db: Queryable, week: string, kind: string, payload: unknown, reason = "") {
  await db.query(`insert into wig_events (week_start, kind, payload, reason) values ($1, $2, $3, $4)`, [week, kind, JSON.stringify(payload ?? {}), reason]);
}

async function tx<T>(db: Queryable, fn: () => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    const out = await fn();
    await db.query("commit");
    return out;
  } catch (e) {
    await db.query("rollback").catch(() => {});
    throw e;
  }
}

function assertPlannable(w: WeekRow, today: string, reason: string) {
  if (!canPlanOn(w.weekStart, today)) throw new WigError("Ten tydzień już się skończył — nie tworzymy celów wstecz.");
  if (w.closeStatus) throw new WigError("Tydzień jest zamknięty — plan jest zamrożony.");
  if (w.planStatus === "zatwierdzony" && !reason) throw new WigError("Plan jest zatwierdzony. Zmiana wymaga uzasadnienia (rewizja planu).");
}

export async function saveLead(db: Queryable, l: LeadInput, today: string): Promise<LeadRow> {
  return tx(db, async () => {
    const w = await ensureWeek(db, l.week);
    assertPlannable(w, today, l.reason);
    let id = l.id;
    if (id) {
      const { rows } = await db.query(
        `update wig_leads set area_key=$2, lead_key=$3, name=$4, unit=$5, direction=$6, target=$7, target_max=$8, weight=$9, source=$10, notes=$11, position=$12, updated_at=now()
          where id=$1 and week_start=$13 returning id`,
        [id, l.area, l.leadKey, l.name, l.unit, l.direction, l.target, l.targetMax, l.weight, l.source, l.notes, l.position, l.week]
      );
      if (!rows[0]) throw new WigError("Nie znaleziono LEAD-a", 404);
    } else {
      const dup = await db.query(`select 1 from wig_leads where week_start=$1 and lead_key=$2`, [l.week, l.leadKey]);
      if (dup.rows[0]) throw new WigError(`LEAD o tym identyfikatorze („${l.leadKey}”) już jest w tym tygodniu — zmień nazwę.`);
      const { rows } = await db.query(
        `insert into wig_leads (week_start, area_key, lead_key, name, unit, direction, target, target_max, weight, source, notes, position)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
        [l.week, l.area, l.leadKey, l.name, l.unit, l.direction, l.target, l.targetMax, l.weight, l.source, l.notes, l.position]
      );
      id = rows[0].id as string;
    }
    if (l.area === "praca" && l.source === "task") {
      if (l.taskId) {
        const { rows } = await db.query(`update weekly_tasks set wig_lead_id=$1, area_key='praca', updated_at=now() where id=$2 and week_start=$3 returning id`, [id, l.taskId, l.week]);
        if (!rows[0]) throw new WigError("Wybrane zadanie nie należy do tego tygodnia w Weekly Plannerze");
      } else {
        const linked = await db.query(`select 1 from weekly_tasks where wig_lead_id=$1`, [id]);
        if (!linked.rows[0]) {
          const pr = l.task?.priority ?? "A";
          const sub = await db.query(`select count(*)::int as c from weekly_tasks where week_start=$1 and priority=$2`, [l.week, pr]);
          await db.query(
            `insert into weekly_tasks (task, project, priority, sub_priority, week_start, status, points, area_key, wig_lead_id) values ($1,$2,$3,$4,$5,'todo',$6,'praca',$7)`,
            [l.name, l.task?.project ?? "Inne", pr, Number(sub.rows[0].c) + 1, l.week, PRIORITY_POINTS[pr] ?? 0, id]
          );
        }
      }
    }
    if (w.planStatus === "zatwierdzony") await event(db, l.week, l.id ? "plan_lead_changed" : "plan_lead_added", { leadKey: l.leadKey, name: l.name, target: l.target, weight: l.weight }, l.reason);
    const leads = await getLeads(db, l.week);
    return leads.find((x) => x.id === id) as LeadRow;
  });
}

export async function deleteLead(db: Queryable, id: string, reason: string, today: string) {
  return tx(db, async () => {
    const { rows } = await db.query(`select to_char(week_start,'YYYY-MM-DD') as week_start, lead_key, name from wig_leads where id=$1`, [id]);
    if (!rows[0]) throw new WigError("Nie znaleziono LEAD-a", 404);
    const week = rows[0].week_start as string;
    const w = (await getWeekRow(db, week)) as WeekRow;
    assertPlannable(w, today, reason);
    await db.query(`delete from wig_leads where id=$1`, [id]); // weekly_tasks.wig_lead_id → NULL; the task stays in the planner
    if (w.planStatus === "zatwierdzony") await event(db, week, "plan_lead_removed", { leadKey: rows[0].lead_key, name: rows[0].name }, reason);
  });
}

export async function setAreaSkip(db: Queryable, week: string, area: LeadArea, reason: string | null, today: string) {
  return tx(db, async () => {
    const w = await ensureWeek(db, week);
    assertPlannable(w, today, reason ?? (w.planStatus === "zatwierdzony" ? "" : "cofnięcie pominięcia"));
    const skip = { ...w.areaSkip };
    if (reason) skip[area] = reason; else delete skip[area];
    await db.query(`update wig_weeks set area_skip=$2, updated_at=now() where week_start=$1`, [week, JSON.stringify(skip)]);
    await event(db, week, reason ? "area_skipped" : "area_unskipped", { area }, reason ?? "");
  });
}

export async function saveReflection(db: Queryable, week: string, area: AreaKey, r: { worked: string; didnt: string; correction: string }, reason: string) {
  return tx(db, async () => {
    const w = await ensureWeek(db, week);
    if (w.closeStatus && !reason) throw new WigError("Tydzień jest zamknięty — korekta wymaga uzasadnienia");
    const refl = { ...w.reflection, [area]: r };
    await db.query(`update wig_weeks set reflection=$2, updated_at=now() where week_start=$1`, [week, JSON.stringify(refl)]);
    if (w.closeStatus) await recloseAfterCorrection(db, week, reason);
  });
}

export async function saveResult(db: Queryable, r: ResultInput, today: string) {
  return tx(db, async () => {
    const { rows } = await db.query(`select to_char(week_start,'YYYY-MM-DD') as week_start from wig_leads where id=$1`, [r.leadId]);
    if (!rows[0]) throw new WigError("Nie znaleziono LEAD-a", 404);
    const week = rows[0].week_start as string;
    if (today < week) throw new WigError("Tydzień jeszcze się nie zaczął — wykonanie wpiszesz od poniedziałku.");
    const w = (await getWeekRow(db, week)) as WeekRow;
    if (w.planStatus !== "zatwierdzony") throw new WigError("Najpierw zatwierdź plan tygodnia — wykonanie zapisujemy do zamrożonego planu.");
    if (w.closeStatus && !r.reason) throw new WigError("Tydzień jest zamknięty — korekta wymaga uzasadnienia");
    const rev = await db.query(`select coalesce(max(revision),0)+1 as r from wig_results where lead_id=$1`, [r.leadId]);
    await db.query(
      `insert into wig_results (lead_id, week_start, revision, actual, status, source_value, evidence, reason) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [r.leadId, week, Number(rev.rows[0].r), r.actual, r.status, r.sourceValue, r.evidence, r.reason]
    );
    if (w.closeStatus) await recloseAfterCorrection(db, week, r.reason);
  });
}

export async function saveRelation(db: Queryable, rel: RelationInput) {
  return tx(db, async () => {
    const w = await ensureWeek(db, rel.week);
    if (w.closeStatus && !rel.reason) throw new WigError("Tydzień jest zamknięty — korekta wymaga uzasadnienia");
    if ((rel.rating !== null || rel.excused) && w.planStatus !== "zatwierdzony") throw new WigError("Samoocenę zapisujemy dla tygodnia z zatwierdzonym planem.");
    const rev = await db.query(`select coalesce(max(revision),0)+1 as r from wig_relation_reviews where week_start=$1 and sub_key=$2`, [rel.week, rel.sub]);
    await db.query(
      `insert into wig_relation_reviews (week_start, sub_key, revision, intention, did_well, did_wrong, impact, do_differently, rating, excused, reason)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [rel.week, rel.sub, Number(rev.rows[0].r), rel.intention, rel.didWell, rel.didWrong, rel.impact, rel.doDifferently, rel.rating, rel.excused, rel.reason]
    );
    if (w.closeStatus) await recloseAfterCorrection(db, rel.week, rel.reason);
  });
}

export async function approvePlan(db: Queryable, week: string, today: string) {
  return tx(db, async () => {
    const w = await ensureWeek(db, week);
    if (w.closeStatus) throw new WigError("Tydzień jest zamknięty");
    if (!canPlanOn(week, today)) throw new WigError("Ten tydzień już się skończył — nie zatwierdzamy planu wstecz.");
    const leads = await getLeads(db, week);
    const problems = weightProblems(leads.map((l) => ({ area: l.area, weight: l.weight })), w.areaSkip);
    if (problems.length) throw new WigError(problems.join(" · "));
    const relations = await getRelations(db, week);
    const snap = {
      approvedAt: new Date().toISOString(),
      leads: leads.map((l) => ({ id: l.id, area: l.area, leadKey: l.leadKey, name: l.name, unit: l.unit, direction: l.direction, target: l.target, targetMax: l.targetMax, weight: l.weight, source: l.source, tasks: l.tasks.map((t) => ({ id: t.id, task: t.task })) })),
      relationIntentions: Object.fromEntries(relations.map((r) => [r.sub, r.intention])),
      areaSkip: w.areaSkip,
    };
    const wasApproved = w.planStatus === "zatwierdzony";
    await db.query(`update wig_weeks set plan_status='zatwierdzony', plan_approved_at=coalesce(plan_approved_at, now()), plan_snapshot=coalesce(plan_snapshot, $2::jsonb), updated_at=now() where week_start=$1`, [week, JSON.stringify(snap)]);
    await event(db, week, wasApproved ? "plan_reconfirmed" : "plan_approved", snap);
  });
}

/** What is still missing before the week can be closed (human-readable). */
export function closeBlockers(row: WeekRow | null, leads: LeadRow[], relations: RelationRow[], today: string): string[] {
  const out: string[] = [];
  if (!row || row.planStatus !== "zatwierdzony") return ["Brak zatwierdzonego planu na ten tydzień — nie ma czego rozliczać (nie tworzymy ocen wstecz)."];
  if (!canCloseOn(row.weekStart, today)) out.push(`Tydzień można zamknąć od niedzieli ${weekEnd(row.weekStart)}.`);
  for (const l of leads) if (!l.result) out.push(`${l.name}: wpisz wykonanie, potwierdź 0 albo oznacz jako usprawiedliwione`);
  for (const s of RELATION_SUBS) {
    const r = relations.find((x) => x.sub === s.key);
    if (!r || (r.rating === null && !r.excused)) out.push(`Relacje — ${s.name}: samoocena 1–6 albo „usprawiedliwione”`);
  }
  return out;
}

function buildSnapshot(row: WeekRow, leads: LeadRow[], relations: RelationRow[]): Snapshot {
  const inst = (a: LeadArea): LeadInstance[] =>
    leads.filter((l) => l.area === a).map((l) => ({ leadKey: l.leadKey, name: l.name, unit: l.unit, direction: l.direction, target: l.target, targetMax: l.targetMax, weight: l.weight, actual: l.result?.actual ?? null, status: l.result?.status ?? null }));
  const ls = { rozwoj: inst("rozwoj"), zdrowie: inst("zdrowie"), praca: inst("praca") };
  const rels: RelationRating[] = relations.map((r) => ({ sub: r.sub, rating: r.rating, excused: r.excused }));
  const areaExcused = Object.fromEntries(LEAD_AREAS.filter((a) => row.areaSkip[a]).map((a) => [a, true])) as Partial<Record<AreaKey, boolean>>;
  const closed: ClosedWeek = { weekStart: row.weekStart, areaExcused, leads: ls, relations: rels };
  const areaResults = Object.fromEntries(LEAD_AREAS.map((a) => { const r = weekAreaResult(ls[a]); return [a, { realization: r.realization, rating: r.rating }]; })) as Snapshot["areaResults"];
  const weekMain = mainScore([row.weekStart], [closed]).value;
  return {
    ...closed, algorithm: ALGORITHM_VERSION, areaWeights: AREA_WEIGHTS, relationWeights: Object.fromEntries(RELATION_SUBS.map((s) => [s.key, s.weight])) as Snapshot["relationWeights"],
    areaResults, relationValue: weekRelationResult(rels).value, weekMain, reflection: row.reflection, areaSkip: row.areaSkip,
    leadDetails: leads.map((l) => ({ leadKey: l.leadKey, source: l.source, evidence: l.result?.evidence ?? "", sourceValue: l.result?.sourceValue ?? null, revision: l.result?.revision ?? 0, tasks: l.tasks.map((t) => `${t.task} (${t.status})`) })),
  };
}

export async function closeWeek(db: Queryable, week: string, today: string) {
  return tx(db, async () => {
    const row = await getWeekRow(db, week);
    if (row?.closeStatus) throw new WigError("Tydzień jest już zamknięty. Zmiany wprowadzaj jako korekty z uzasadnieniem.");
    const leads = await getLeads(db, week);
    const relations = await getRelations(db, week);
    const blockers = closeBlockers(row, leads, relations, today);
    if (blockers.length) throw new WigError(blockers.join(" · "));
    const snap = buildSnapshot(row as WeekRow, leads, relations);
    await db.query(`insert into wig_week_closes (week_start, version, algorithm_version, snapshot) values ($1, 1, $2, $3)`, [week, ALGORITHM_VERSION, JSON.stringify(snap)]);
    await db.query(`update wig_weeks set close_status='zamknieta', closed_at=now(), updated_at=now() where week_start=$1`, [week]);
    await event(db, week, "week_closed", { version: 1, weekMain: snap.weekMain });
    return snap;
  });
}

/** Inside a correction transaction: new close version from the current (corrected) data. */
async function recloseAfterCorrection(db: Queryable, week: string, reason: string) {
  const row = (await getWeekRow(db, week)) as WeekRow;
  const leads = await getLeads(db, week);
    const relations = await getRelations(db, week);
  const snap = buildSnapshot(row, leads, relations);
  const v = await db.query(`select coalesce(max(version),0)+1 as v from wig_week_closes where week_start=$1`, [week]);
  await db.query(`insert into wig_week_closes (week_start, version, algorithm_version, reason, snapshot) values ($1,$2,$3,$4,$5)`, [week, Number(v.rows[0].v), ALGORITHM_VERSION, reason, JSON.stringify(snap)]);
  await db.query(`update wig_weeks set close_status='skorygowana', updated_at=now() where week_start=$1`, [week]);
  await event(db, week, "week_corrected", { version: Number(v.rows[0].v), weekMain: snap.weekMain }, reason);
}

/** Latest close snapshot per week, for a list of weeks. */
async function latestSnapshots(db: Queryable, weeks: string[]): Promise<Map<string, CloseRow & { week: string }>> {
  if (!weeks.length) return new Map();
  const { rows } = await db.query(
    `select distinct on (week_start) to_char(week_start,'YYYY-MM-DD') as week, version, closed_at::text, reason, algorithm_version, snapshot
       from wig_week_closes where week_start = any($1::date[]) order by week_start, version desc`,
    [weeks]
  );
  return new Map(rows.map((r) => [r.week as string, { week: r.week as string, version: Number(r.version), closedAt: r.closed_at as string, reason: r.reason as string, algorithm: r.algorithm_version as string, snapshot: r.snapshot as Snapshot }]));
}

export async function getSummary(db: Queryable, today: string) {
  const current = weekStartIso(today);
  const curRow = await getWeekRow(db, current);
  const windowWeeks = windowWeekStarts(current, !!curRow?.closeStatus, addDaysIso);
  const histWeeks = Array.from({ length: 12 }, (_, i) => addDaysIso(windowWeeks[3], -7 * (11 - i)));
  const snaps = await latestSnapshots(db, histWeeks);
  const slots = windowWeeks.map((w) => snaps.get(w)?.snapshot ?? null);
  const score = mainScore(windowWeeks, slots);
  const { rows: weekRows } = await db.query(`select ${WEEK_COLS} from wig_weeks where week_start >= $1 order by week_start`, [histWeeks[0]]);
  const history = weekRows.map(mapWeek).map((w) => {
    const s = snaps.get(w.weekStart);
    return { weekStart: w.weekStart, planStatus: w.planStatus, closeStatus: w.closeStatus, version: s?.version ?? null, weekMain: s?.snapshot.weekMain ?? null, areaResults: s?.snapshot.areaResults ?? null, relationValue: s?.snapshot.relationValue ?? null, reflection: (s?.snapshot.reflection ?? w.reflection) as WeekRow["reflection"] };
  });
  const planning = planningWeekFor(today);
  const planRow = await getWeekRow(db, planning);
  return { today, currentWeek: current, planningWeek: planning, planningStatus: planRow?.planStatus ?? null, score, history };
}

// ── Context: WIG text, LAGs, monthly goals, ROCKS ───────────────────────────────────────────

export async function getContext(db: Queryable, today: string) {
  const month = today.slice(0, 8) + "01";
  const ctx = (await db.query(`select area_key, wig from wig_area_context`)).rows;
  const lags = (await db.query(`select id, area_key, name, unit, target, to_char(deadline,'YYYY-MM-DD') as deadline, lead_key, start_value, manual_value from wig_lags order by created_at`)).rows;
  const monthly = (await db.query(`select id, to_char(month,'YYYY-MM-DD') as month, area_key, name, unit, target, lead_key, manual_value from wig_monthly_goals where month = $1 order by created_at`, [month])).rows;
  const rocks = (await db.query(`select id, quarter, area_key, title, owner, milestone, to_char(due,'YYYY-MM-DD') as due, status, wig from rocks order by quarter desc, created_at`)).rows;
  // Progress from closed weeks (latest version) for lead_keys used by LAGs / monthly goals.
  const keys = [...new Set([...lags, ...monthly].map((x) => x.lead_key as string | null).filter(Boolean))] as string[];
  const sums = new Map<string, { total: number; month: number }>();
  if (keys.length) {
    const { rows } = await db.query(
      `select s.snapshot, to_char(s.week_start,'YYYY-MM-DD') as week from (select distinct on (week_start) week_start, snapshot from wig_week_closes order by week_start, version desc) s`
    );
    for (const r of rows) {
      const snap = r.snapshot as Snapshot;
      for (const a of LEAD_AREAS) for (const l of snap.leads[a] ?? []) {
        if (!keys.includes(l.leadKey) || l.actual === null || l.status === "excused") continue;
        const cur = sums.get(l.leadKey) ?? { total: 0, month: 0 };
        cur.total += l.actual;
        if ((r.week as string).slice(0, 7) === month.slice(0, 7)) cur.month += l.actual; // weeks starting in this month
        sums.set(l.leadKey, cur);
      }
    }
  }
  return {
    context: Object.fromEntries(ctx.map((c) => [c.area_key, c.wig])) as Record<string, string>,
    lags: lags.map((l) => ({ id: l.id, area: l.area_key, name: l.name, unit: l.unit, target: n(l.target), deadline: l.deadline, leadKey: l.lead_key, startValue: Number(l.start_value), manualValue: n(l.manual_value), current: l.manual_value !== null ? Number(l.manual_value) : Number(l.start_value) + (l.lead_key ? sums.get(l.lead_key as string)?.total ?? 0 : 0) })),
    monthly: monthly.map((m) => ({ id: m.id, month: m.month, area: m.area_key, name: m.name, unit: m.unit, target: n(m.target), leadKey: m.lead_key, manualValue: n(m.manual_value), current: m.manual_value !== null ? Number(m.manual_value) : m.lead_key ? sums.get(m.lead_key as string)?.month ?? 0 : null })),
    rocks: rocks.map((r) => ({ id: r.id, quarter: r.quarter, area: r.area_key, title: r.title, owner: r.owner, milestone: r.milestone, due: r.due, status: r.status, wig: r.wig })),
  };
}

export async function saveContext(db: Queryable, area: AreaKey, wig: string) {
  await db.query(`insert into wig_area_context (area_key, wig) values ($1,$2) on conflict (area_key) do update set wig=$2, updated_at=now()`, [area, wig]);
}

export async function saveLag(db: Queryable, l: { id?: string; area: AreaKey; name: string; unit: string; target: number | null; deadline: string | null; leadKey: string | null; startValue: number; manualValue: number | null }) {
  if (l.id) await db.query(`update wig_lags set area_key=$2, name=$3, unit=$4, target=$5, deadline=$6, lead_key=$7, start_value=$8, manual_value=$9, updated_at=now() where id=$1`, [l.id, l.area, l.name, l.unit, l.target, l.deadline, l.leadKey, l.startValue, l.manualValue]);
  else await db.query(`insert into wig_lags (area_key, name, unit, target, deadline, lead_key, start_value, manual_value) values ($1,$2,$3,$4,$5,$6,$7,$8)`, [l.area, l.name, l.unit, l.target, l.deadline, l.leadKey, l.startValue, l.manualValue]);
}

export async function saveMonthly(db: Queryable, m: { id?: string; month: string; area: AreaKey; name: string; unit: string; target: number | null; leadKey: string | null; manualValue: number | null }) {
  if (m.id) await db.query(`update wig_monthly_goals set area_key=$2, name=$3, unit=$4, target=$5, lead_key=$6, manual_value=$7, updated_at=now() where id=$1`, [m.id, m.area, m.name, m.unit, m.target, m.leadKey, m.manualValue]);
  else await db.query(`insert into wig_monthly_goals (month, area_key, name, unit, target, lead_key, manual_value) values ($1,$2,$3,$4,$5,$6,$7)`, [m.month, m.area, m.name, m.unit, m.target, m.leadKey, m.manualValue]);
}

export async function saveRock(db: Queryable, r: { id?: string; quarter: string; area: AreaKey; title: string; owner: string; milestone: string; due: string | null; status: string; wig: string }) {
  if (r.id) await db.query(`update rocks set quarter=$2, area_key=$3, title=$4, owner=$5, milestone=$6, due=$7, status=$8, wig=$9, updated_at=now() where id=$1`, [r.id, r.quarter, r.area, r.title, r.owner, r.milestone, r.due, r.status, r.wig]);
  else await db.query(`insert into rocks (quarter, area_key, title, owner, milestone, due, status, wig) values ($1,$2,$3,$4,$5,$6,$7,$8)`, [r.quarter, r.area, r.title, r.owner, r.milestone, r.due, r.status, r.wig]);
}

export async function deleteRow(db: Queryable, table: "wig_lags" | "wig_monthly_goals" | "rocks", id: string) {
  await db.query(`delete from ${table} where id=$1`, [id]);
}

// ── Automatic sources (suggestions only — the user confirms every value) ─────────────────────

export type SourceSuggestion = { value: number | null; evidence: string; complete: boolean };

export async function getSources(db: Queryable, week: string, today: string): Promise<Record<string, SourceSuggestion>> {
  const end = weekEnd(week);
  const last = end < today ? end : today;
  const out: Record<string, SourceSuggestion> = {};
  const safe = async (key: string, fn: () => Promise<SourceSuggestion>) => {
    try { out[key] = await fn(); } catch (e) { out[key] = { value: null, evidence: `źródło niedostępne: ${(e as Error).message.slice(0, 80)}`, complete: false }; }
  };
  await safe("rehab_days", async () => {
    const { rows } = await db.query(`select count(*) filter (where percent > 0)::int as d, coalesce(round(avg(percent)),0)::int as avg from rehab_entries where date between $1 and $2`, [week, last]);
    return { value: Number(rows[0].d), evidence: `rehab_entries ${week}–${last}: ${rows[0].d} dni z wpisem > 0%, średnio ${rows[0].avg}%`, complete: last === end };
  });
  await safe("calories_week", async () => {
    const { rows } = await db.query(`select count(*)::int as d, coalesce(sum(calories),0)::int as kcal from nutrition_log where date between $1 and $2 and calories is not null`, [week, end]);
    const logged = Number(rows[0].d);
    return { value: Number(rows[0].kcal), evidence: `nutrition_log: ${rows[0].kcal} kcal, zalogowane dni ${logged}/7${logged < 7 ? " — niepełne logowanie, rozstrzygnij ręcznie" : ""}`, complete: logged === 7 };
  });
  await safe("reading_minutes", async () => {
    const { rows } = await db.query(`select to_char(period_from,'YYYY-MM-DD') as period_from, to_char(period_to,'YYYY-MM-DD') as period_to, minutes, pages, reading_days, books_finished from bookly_reports where period_to >= $1 and period_from <= $2`, [addDaysIso(week, -400), end]);
    const reports = rows.map((r) => ({ period_from: r.period_from as string, period_to: r.period_to as string, minutes: Number(r.minutes), pages: Number(r.pages), reading_days: Number(r.reading_days), books_finished: Number(r.books_finished) })) as BooklyReport[];
    const dv = dailyValues(reports);
    let sum = 0, covered = 0;
    for (let d = week; d <= end; d = addDaysIso(d, 1)) { const v = dv.get(d); if (v) { sum += v.minutes; covered++; } }
    return { value: covered ? Math.round(sum) : null, evidence: covered ? `Bookly: ${Math.round(sum)} min (raporty okresowe rozłożone na dni; pokrycie ${covered}/7 dni)` : "Bookly: brak raportu obejmującego ten tydzień", complete: covered === 7 };
  });
  await safe("audiobook_minutes", async () => {
    const { rows } = await db.query(`select coalesce(sum(amount),0)::int as m, count(*)::int as c from rozwoj_entries where area='sluchanie' and date between $1 and $2`, [week, end]);
    return { value: Number(rows[0].m), evidence: `rozwoj_entries (słuchanie): ${rows[0].m} min w ${rows[0].c} wpisach`, complete: last === end };
  });
  return out;
}
