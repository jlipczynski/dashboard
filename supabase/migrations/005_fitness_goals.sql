-- Fitness goals persistence (replaces localStorage-only storage)
-- Uses a single-row key-value approach for simplicity
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

-- Enable RLS
ALTER TABLE fitness_goals ENABLE ROW LEVEL SECURITY;

-- Allow all operations (public dashboard, no auth)
CREATE POLICY "Allow all on fitness_goals" ON fitness_goals
  FOR ALL USING (true) WITH CHECK (true);
