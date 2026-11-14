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
-- RLS wlaczone, BEZ polityk: dostep tylko przez service role (API routes).
CREATE INDEX IF NOT EXISTS idx_work_checkins_date ON work_checkins (date DESC);
