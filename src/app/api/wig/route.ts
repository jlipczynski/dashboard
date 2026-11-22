import { NextResponse } from "next/server";
import pg from "pg";
import { todayWarsaw } from "@/lib/dates";
import {
  WigError, approvePlan, closeBlockers, closeWeek, deleteLead, deleteRow, getContext, getSources, getSummary, getWeekFull,
  saveContext, saveLag, saveLead, saveMonthly, saveReflection, saveRelation, saveResult, saveRock, setAreaSkip, type Queryable,
} from "@/lib/wig-db";
import { ALL_AREAS, DATE_RE, LEAD_AREAS, isMonday, parseLead, parseRelation, parseResult, quarterOf, type LeadArea } from "@/lib/wig-model";
import type { AreaKey } from "@/lib/wig-score";

// WIG Sessions 1.0 API. Access is protected by middleware (Google session + ALLOWED_EMAILS).
// Reflection texts are private: never logged.
export const dynamic = "force-dynamic";

const dbUrl = process.env.DATABASE_POOLER_URL || process.env.DATABASE_URL;

async function withDb<T>(fn: (db: Queryable) => Promise<T>): Promise<T> {
  if (!dbUrl) throw new Error("No DATABASE_URL configured");
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);
  const client = new pg.Client({ connectionString: dbUrl, ssl: local ? false : { rejectUnauthorized: false } });
  await client.connect();
  try {
    return await fn(client as unknown as Queryable);
  } finally {
    await client.end();
  }
}

/** Server "today" in Europe/Warsaw. WIG_TODAY is honoured only outside production (tests). */
function today(): string {
  const t = process.env.WIG_TODAY;
  if (t && process.env.VERCEL_ENV !== "production" && DATE_RE.test(t)) return t;
  return todayWarsaw();
}

function fail(e: unknown) {
  if (e instanceof WigError) return NextResponse.json({ error: e.message }, { status: e.status });
  const msg = (e as Error).message ?? String(e);
  console.error("api/wig error:", msg.slice(0, 300));
  if (/relation "(wig_|rocks)/.test(msg)) return NextResponse.json({ error: "Brak tabel WIG w bazie — migracja 033 nie jest jeszcze uruchomiona." }, { status: 503 });
  return NextResponse.json({ error: msg.slice(0, 200) }, { status: 500 });
}

const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const numOrNull = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(String(v).replace(",", ".")));
const area = (v: unknown): AreaKey => {
  const a = str(v) as AreaKey;
  if (!ALL_AREAS.includes(a)) throw new WigError("Nieznany obszar");
  return a;
};

/**
 * GET /api/wig?view=summary
 * GET /api/wig?view=week&week=YYYY-MM-DD   (week + leads + results + relations + closes + blockers)
 * GET /api/wig?view=sources&week=YYYY-MM-DD
 * GET /api/wig?view=context
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const view = sp.get("view") ?? "summary";
  const t = today();
  try {
    return await withDb(async (db) => {
      if (view === "summary") return NextResponse.json(await getSummary(db, t));
      if (view === "context") return NextResponse.json(await getContext(db, t));
      const week = sp.get("week") ?? "";
      if (!isMonday(week)) return NextResponse.json({ error: "week musi być poniedziałkiem YYYY-MM-DD" }, { status: 400 });
      if (view === "week") {
        const full = await getWeekFull(db, week);
        const tasks = (await db.query(`select id, task, status, project, priority, wig_lead_id from weekly_tasks where week_start=$1 order by priority, sub_priority, created_at`, [week])).rows;
        return NextResponse.json({ ...full, today: t, blockers: closeBlockers(full.row, full.leads, full.relations, t), weekTasks: tasks.map((x) => ({ ...x, priority: String(x.priority).trim() })) });
      }
      if (view === "sources") return NextResponse.json({ sources: await getSources(db, week, t) });
      return NextResponse.json({ error: "Nieznany widok" }, { status: 400 });
    });
  } catch (e) {
    return fail(e);
  }
}

/** POST /api/wig { action, ... } — see the switch below. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const t = today();
  try {
    return await withDb(async (db) => {
      switch (b.action) {
        case "save_lead": {
          const p = parseLead(b);
          if (!p.ok) throw new WigError(p.error);
          return NextResponse.json({ lead: await saveLead(db, p.lead, t) });
        }
        case "delete_lead":
          await deleteLead(db, str(b.id, 40), str(b.reason, 500), t);
          return NextResponse.json({ status: "ok" });
        case "skip_area": {
          const a = str(b.area) as LeadArea;
          if (!LEAD_AREAS.includes(a) || !isMonday(str(b.week))) throw new WigError("Nieprawidłowy obszar lub tydzień");
          const reason = str(b.reason, 300);
          await setAreaSkip(db, str(b.week), a, reason || null, t);
          return NextResponse.json({ status: "ok" });
        }
        case "approve_plan":
          if (!isMonday(str(b.week))) throw new WigError("Nieprawidłowy tydzień");
          await approvePlan(db, str(b.week), t);
          return NextResponse.json({ status: "ok" });
        case "save_result": {
          const p = parseResult(b);
          if (!p.ok) throw new WigError(p.error);
          await saveResult(db, p.result, t);
          return NextResponse.json({ status: "ok" });
        }
        case "save_relation": {
          const p = parseRelation(b);
          if (!p.ok) throw new WigError(p.error);
          await saveRelation(db, p.rel);
          return NextResponse.json({ status: "ok" });
        }
        case "save_reflection":
          if (!isMonday(str(b.week))) throw new WigError("Nieprawidłowy tydzień");
          await saveReflection(db, str(b.week), area(b.area), { worked: str(b.worked), didnt: str(b.didnt), correction: str(b.correction) }, str(b.reason, 500));
          return NextResponse.json({ status: "ok" });
        case "close_week":
          if (!isMonday(str(b.week))) throw new WigError("Nieprawidłowy tydzień");
          return NextResponse.json({ snapshot: await closeWeek(db, str(b.week), t) });
        case "save_context":
          await saveContext(db, area(b.area), str(b.wig, 500));
          return NextResponse.json({ status: "ok" });
        case "save_lag": {
          const name = str(b.name, 120);
          if (!name) throw new WigError("Podaj nazwę LAG-a");
          const deadline = str(b.deadline);
          await saveLag(db, { id: str(b.id, 40) || undefined, area: area(b.area), name, unit: str(b.unit, 30), target: numOrNull(b.target), deadline: DATE_RE.test(deadline) ? deadline : null, leadKey: str(b.leadKey, 60) || null, startValue: numOrNull(b.startValue) ?? 0, manualValue: numOrNull(b.manualValue) });
          return NextResponse.json({ status: "ok" });
        }
        case "save_monthly": {
          const name = str(b.name, 120);
          if (!name) throw new WigError("Podaj nazwę celu miesięcznego");
          await saveMonthly(db, { id: str(b.id, 40) || undefined, month: t.slice(0, 8) + "01", area: area(b.area), name, unit: str(b.unit, 30), target: numOrNull(b.target), leadKey: str(b.leadKey, 60) || null, manualValue: numOrNull(b.manualValue) });
          return NextResponse.json({ status: "ok" });
        }
        case "save_rock": {
          const title = str(b.title, 160);
          if (!title) throw new WigError("Podaj nazwę ROCK-a");
          const q = str(b.quarter) || quarterOf(t);
          if (!/^\d{4}-Q[1-4]$/.test(q)) throw new WigError("Kwartał w formacie 2026-Q4");
          const status = str(b.status) || "planowany";
          if (!["planowany", "w_toku", "zrobiony", "porzucony"].includes(status)) throw new WigError("Nieznany status");
          const due = str(b.due);
          await saveRock(db, { id: str(b.id, 40) || undefined, quarter: q, area: area(b.area), title, owner: str(b.owner, 60) || "Jan", milestone: str(b.milestone, 300), due: DATE_RE.test(due) ? due : null, status, wig: str(b.wig, 300) });
          return NextResponse.json({ status: "ok" });
        }
        case "delete_lag":
        case "delete_monthly":
        case "delete_rock": {
          const table = b.action === "delete_lag" ? "wig_lags" : b.action === "delete_monthly" ? "wig_monthly_goals" : "rocks";
          await deleteRow(db, table, str(b.id, 40));
          return NextResponse.json({ status: "ok" });
        }
        default:
          return NextResponse.json({ error: "Nieznana akcja" }, { status: 400 });
      }
    });
  } catch (e) {
    return fail(e);
  }
}
