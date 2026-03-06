import { NextResponse } from "next/server";
import { runMigrationSQL, hasDbUrl } from "@/lib/db";

export const dynamic = "force-dynamic";

// All migrations inlined — Vercel serverless doesn't have access to supabase/migrations/ on disk
const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: "001_weekly_goals.sql",
    sql: `
CREATE TABLE IF NOT EXISTS weekly_goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  goal TEXT NOT NULL,
  project TEXT NOT NULL,
  week_start DATE NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE weekly_goals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Allow all on weekly_goals" ON weekly_goals
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS idx_weekly_goals_week_start ON weekly_goals (week_start);
`,
  },
  {
    name: "002_weekly_tasks.sql",
    sql: `
CREATE TABLE IF NOT EXISTS weekly_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task TEXT NOT NULL,
  project TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('A', 'B', 'C', 'D', 'E')),
  sub_priority INT DEFAULT 1,
  wig_id TEXT DEFAULT '',
  deadline DATE,
  person TEXT DEFAULT '',
  status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'done')),
  week_start DATE NOT NULL,
  points INT DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE weekly_tasks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Allow all on weekly_tasks" ON weekly_tasks
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS idx_weekly_tasks_week_start ON weekly_tasks (week_start);
CREATE INDEX IF NOT EXISTS idx_weekly_tasks_priority ON weekly_tasks (priority, sub_priority);
`,
  },
  {
    name: "003_nutrition_log.sql",
    sql: `
CREATE TABLE IF NOT EXISTS nutrition_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  calories INT NOT NULL DEFAULT 0,
  fat_g NUMERIC(6,1) DEFAULT 0,
  saturated_fat_g NUMERIC(6,1) DEFAULT 0,
  cholesterol_mg NUMERIC(6,1) DEFAULT 0,
  sodium_mg NUMERIC(6,1) DEFAULT 0,
  carbs_g NUMERIC(6,1) DEFAULT 0,
  fiber_g NUMERIC(6,1) DEFAULT 0,
  sugar_g NUMERIC(6,1) DEFAULT 0,
  protein_g NUMERIC(6,1) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE nutrition_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Allow all on nutrition_log" ON nutrition_log
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS idx_nutrition_log_date ON nutrition_log (date DESC);
`,
  },
  {
    name: "004_goals_priority.sql",
    sql: `
ALTER TABLE weekly_goals ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'A' CHECK (priority IN ('A', 'B', 'C', 'D', 'E'));
ALTER TABLE weekly_goals ADD COLUMN IF NOT EXISTS sub_priority INT DEFAULT 1;
`,
  },
  {
    name: "005_fitness_goals.sql",
    sql: `
CREATE TABLE IF NOT EXISTS fitness_goals (
  id TEXT PRIMARY KEY DEFAULT 'default',
  goals JSONB NOT NULL DEFAULT '{}',
  gym_days JSONB NOT NULL DEFAULT '[false,false,false,false,false,false,false]',
  gym_weekly_goal NUMERIC DEFAULT 0,
  gym_monthly_goal NUMERIC DEFAULT 0,
  gym_monthly_done NUMERIC DEFAULT 0,
  run_weekly_goal NUMERIC DEFAULT 0,
  run_monthly_goal NUMERIC DEFAULT 0,
  bike_weekly_goal NUMERIC DEFAULT 0,
  bike_monthly_goal NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE fitness_goals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Allow all on fitness_goals" ON fitness_goals
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
`,
  },
  {
    name: "006_rozwoj_entries.sql",
    sql: `
CREATE TABLE IF NOT EXISTS rozwoj_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  area TEXT NOT NULL CHECK (area IN ('czytanie', 'sluchanie', 'pisanie')),
  date DATE NOT NULL,
  amount INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(area, date)
);
ALTER TABLE rozwoj_entries ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Allow all on rozwoj_entries" ON rozwoj_entries
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS idx_rozwoj_entries_area_date ON rozwoj_entries (area, date DESC);
`,
  },
  {
    name: "007_fitness_goals_extras.sql",
    sql: `
ALTER TABLE fitness_goals ADD COLUMN IF NOT EXISTS rozwoj_targets JSONB NOT NULL DEFAULT '{"czytanie":{"monthly":300,"weekly":75},"sluchanie":{"monthly":600,"weekly":150},"pisanie":{"monthly":30,"weekly":8}}';
ALTER TABLE fitness_goals ADD COLUMN IF NOT EXISTS run_entries JSONB NOT NULL DEFAULT '[0,0,0,0,0,0,0]';
ALTER TABLE fitness_goals ADD COLUMN IF NOT EXISTS bike_entries JSONB NOT NULL DEFAULT '[0,0,0,0,0,0,0]';
`,
  },
  {
    name: "008_books.sql",
    sql: `
CREATE TABLE IF NOT EXISTS books (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  total_pages INT NOT NULL DEFAULT 0,
  current_page INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'reading' CHECK (status IN ('reading', 'finished', 'archived')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Allow all on books" ON books
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS idx_books_status ON books (status);

CREATE TABLE IF NOT EXISTS book_readings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  page_from INT NOT NULL DEFAULT 0,
  page_to INT NOT NULL,
  pages_read INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE book_readings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Allow all on book_readings" ON book_readings
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS idx_book_readings_book_date ON book_readings (book_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_book_readings_date ON book_readings (date DESC);
`,
  },
  {
    name: "009_books_type_cover.sql",
    sql: `
ALTER TABLE books ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'reading' CHECK (type IN ('reading', 'listening'));
ALTER TABLE books ADD COLUMN IF NOT EXISTS cover_url TEXT;
CREATE INDEX IF NOT EXISTS idx_books_type ON books (type);
`,
  },
  {
    name: "010_work_checkins.sql",
    sql: `
CREATE TABLE IF NOT EXISTS work_checkins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  daily_plan BOOLEAN NOT NULL DEFAULT false,
  weekly_review BOOLEAN NOT NULL DEFAULT false,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE work_checkins ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Allow all on work_checkins" ON work_checkins
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS idx_work_checkins_date ON work_checkins (date DESC);
`,
  },
  {
    name: "011_create_backlog_items.sql",
    sql: `
CREATE TABLE IF NOT EXISTS backlog_items (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at       TIMESTAMPTZ DEFAULT now(),
  title            TEXT NOT NULL,
  description      TEXT,
  type             TEXT NOT NULL DEFAULT 'task'
                   CHECK (type IN ('task', 'idea', 'note', 'goal', 'question')),
  pillar           INT CHECK (pillar BETWEEN 1 AND 5),
  project          TEXT CHECK (project IN ('ovoc', 'plantacja', 'inne')),
  priority         TEXT NOT NULL DEFAULT 'C'
                   CHECK (priority IN ('A', 'B', 'C', 'D', 'E')),
  is_wig           BOOLEAN NOT NULL DEFAULT FALSE,
  due_date         DATE,
  status           TEXT NOT NULL DEFAULT 'backlog'
                   CHECK (status IN ('backlog', 'this_week', 'done', 'archived')),
  audio_filename   TEXT,
  source_transcript TEXT
);
ALTER TABLE backlog_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Allow all on backlog_items" ON backlog_items
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS idx_backlog_status   ON backlog_items(status);
CREATE INDEX IF NOT EXISTS idx_backlog_pillar   ON backlog_items(pillar);
CREATE INDEX IF NOT EXISTS idx_backlog_priority ON backlog_items(priority);
CREATE INDEX IF NOT EXISTS idx_backlog_created  ON backlog_items(created_at DESC);
`,
  },
];

async function runMigrations(): Promise<{
  ran: string[];
  skipped: string[];
  errors: string[];
}> {
  if (!hasDbUrl()) {
    throw new Error("No DATABASE_URL configured");
  }

  const ran: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const migration of MIGRATIONS) {
    try {
      const result = await runMigrationSQL(migration.name, migration.sql);
      if (result === "skipped") {
        skipped.push(migration.name);
      } else {
        ran.push(migration.name);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      // If object already exists, treat as skipped
      if (msg.includes("already exists")) {
        skipped.push(migration.name);
      } else {
        errors.push(`${migration.name}: ${msg}`);
      }
    }
  }

  return { ran, skipped, errors };
}

export async function POST() {
  try {
    const result = await runMigrations();
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET also runs migrations (convenience)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  // Debug mode: show which env vars are set (no secrets)
  if (searchParams.get("debug") === "1") {
    const pooler = process.env.DATABASE_POOLER_URL || "";
    const direct = process.env.DATABASE_URL || "";
    const used = pooler || direct;
    let parsed: Record<string, string | number> = {};
    try {
      const u = new URL(used);
      const decodedPass = decodeURIComponent(u.password);
      parsed = {
        user: decodeURIComponent(u.username),
        host: u.hostname,
        port: u.port,
        db: u.pathname.replace("/", ""),
        passwordRawLength: u.password.length,
        passwordDecodedLength: decodedPass.length,
        passwordFirst2: decodedPass.substring(0, 2) + "***",
        passwordLast2: "***" + decodedPass.substring(decodedPass.length - 2),
      };
    } catch {
      parsed = { error: "URL parse failed" };
    }
    return NextResponse.json({
      hasPoolerUrl: !!process.env.DATABASE_POOLER_URL,
      hasDirectUrl: !!process.env.DATABASE_URL,
      usingVar: pooler ? "DATABASE_POOLER_URL" : direct ? "DATABASE_URL" : "NONE",
      parsed,
      rawUrlPrefix: used.substring(0, 30) + "...",
    });
  }

  try {
    const result = await runMigrations();
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
