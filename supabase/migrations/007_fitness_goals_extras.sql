-- Add rozwoj targets and weekly run/bike entries to fitness_goals
ALTER TABLE fitness_goals ADD COLUMN IF NOT EXISTS rozwoj_targets JSONB NOT NULL DEFAULT '{"czytanie":{"monthly":300,"weekly":75},"sluchanie":{"monthly":600,"weekly":150},"pisanie":{"monthly":30,"weekly":8}}';
ALTER TABLE fitness_goals ADD COLUMN IF NOT EXISTS run_entries JSONB NOT NULL DEFAULT '[0,0,0,0,0,0,0]';
ALTER TABLE fitness_goals ADD COLUMN IF NOT EXISTS bike_entries JSONB NOT NULL DEFAULT '[0,0,0,0,0,0,0]';
