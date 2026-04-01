// Shared migration definitions used by /api/migrate and scripts/migrate.mjs
// Supabase JS client cannot run DDL (CREATE TABLE), so we use either:
// 1. pg direct connection (needs DATABASE_URL with correct password)
// 2. Supabase Management API (needs SUPABASE_ACCESS_TOKEN)

export const MIGRATIONS: { name: string; sql: string }[] = [
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
  {
    name: "012_finance.sql",
    sql: `
CREATE TABLE IF NOT EXISTS finance_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE finance_categories ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Allow all on finance_categories" ON finance_categories
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS finance_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern TEXT NOT NULL UNIQUE,
  category_id UUID REFERENCES finance_categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE finance_rules ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Allow all on finance_rules" ON finance_rules
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS finance_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  description TEXT NOT NULL,
  counterparty TEXT,
  amount DECIMAL(12,2) NOT NULL,
  balance DECIMAL(12,2),
  category_id UUID REFERENCES finance_categories(id),
  import_hash TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE finance_transactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Allow all on finance_transactions" ON finance_transactions
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS idx_finance_transactions_date ON finance_transactions (date DESC);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_category ON finance_transactions (category_id);

INSERT INTO finance_categories (name, type) VALUES
  ('Travel', 'expense'),
  ('Mati USA', 'expense'),
  ('Zwierzaki', 'expense'),
  ('Rozrywka', 'expense'),
  ('Jedzenie na zewnątrz', 'expense'),
  ('Inne', 'expense'),
  ('Food & Drink', 'expense'),
  ('Kids sport', 'expense'),
  ('Transportation', 'expense'),
  ('Kids education', 'expense'),
  ('Housing & Utilities', 'expense'),
  ('Kids other', 'expense'),
  ('Personal Care', 'expense'),
  ('Shopping', 'expense'),
  ('Health Care', 'expense'),
  ('Membership', 'expense'),
  ('Giving', 'expense'),
  ('Maliny', 'income'),
  ('Salary', 'income'),
  ('Investment', 'income')
ON CONFLICT (name) DO NOTHING;
`,
  },
]
