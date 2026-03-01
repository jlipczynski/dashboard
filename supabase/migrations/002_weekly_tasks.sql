-- Weekly Tasks table
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

-- Enable RLS
ALTER TABLE weekly_tasks ENABLE ROW LEVEL SECURITY;

-- Allow all operations (public dashboard, no auth)
CREATE POLICY "Allow all on weekly_tasks" ON weekly_tasks
  FOR ALL USING (true) WITH CHECK (true);

-- Index for fast week queries
CREATE INDEX IF NOT EXISTS idx_weekly_tasks_week_start ON weekly_tasks (week_start);
CREATE INDEX IF NOT EXISTS idx_weekly_tasks_priority ON weekly_tasks (priority, sub_priority);
