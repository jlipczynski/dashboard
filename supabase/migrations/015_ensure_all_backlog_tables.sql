-- Combined migration: ensure all backlog-related tables and columns exist
-- Safe to run multiple times (all operations are idempotent)

-- 1. backlog_audio_processed table
CREATE TABLE IF NOT EXISTS backlog_audio_processed (
  file_id      TEXT PRIMARY KEY,
  filename     TEXT NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT now(),
  items_count  INT DEFAULT 0
);

ALTER TABLE backlog_audio_processed ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Allow all on backlog_audio_processed" ON backlog_audio_processed
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. audio_file_id column on backlog_items
ALTER TABLE backlog_items
  ADD COLUMN IF NOT EXISTS audio_file_id TEXT;

-- 3. backlog_item_id column on weekly_tasks
ALTER TABLE weekly_tasks
  ADD COLUMN IF NOT EXISTS backlog_item_id UUID REFERENCES backlog_items(id);
CREATE INDEX IF NOT EXISTS idx_weekly_backlog ON weekly_tasks(backlog_item_id);
