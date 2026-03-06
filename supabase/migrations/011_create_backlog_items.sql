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
