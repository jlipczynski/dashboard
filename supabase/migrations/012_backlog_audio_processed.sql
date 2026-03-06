CREATE TABLE IF NOT EXISTS backlog_audio_processed (
  file_id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT now(),
  items_count INT DEFAULT 0
);

ALTER TABLE backlog_audio_processed ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Allow all on backlog_audio_processed" ON backlog_audio_processed
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
