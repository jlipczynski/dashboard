-- Weekly Goals table
CREATE TABLE IF NOT EXISTS weekly_goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  goal TEXT NOT NULL,
  project TEXT NOT NULL,
  week_start DATE NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE weekly_goals ENABLE ROW LEVEL SECURITY;

-- RLS wlaczone, BEZ polityk: dostep tylko przez service role (API routes).

-- Index for fast week queries
CREATE INDEX IF NOT EXISTS idx_weekly_goals_week_start ON weekly_goals (week_start);
