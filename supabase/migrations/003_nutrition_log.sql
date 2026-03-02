-- Nutrition log from MyFitnessPal CSV imports
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

-- Enable RLS
ALTER TABLE nutrition_log ENABLE ROW LEVEL SECURITY;

-- Allow all operations (public dashboard, no auth)
CREATE POLICY "Allow all on nutrition_log" ON nutrition_log
  FOR ALL USING (true) WITH CHECK (true);

-- Index for date range queries
CREATE INDEX IF NOT EXISTS idx_nutrition_log_date ON nutrition_log (date DESC);
