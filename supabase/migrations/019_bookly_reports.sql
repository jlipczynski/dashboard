-- Bookly reading reports (aggregates for a date range), imported from images
CREATE TABLE IF NOT EXISTS bookly_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  minutes INT NOT NULL DEFAULT 0,
  pages INT NOT NULL DEFAULT 0,
  reading_days INT NOT NULL DEFAULT 0,
  books_finished INT NOT NULL DEFAULT 0,
  finished_titles JSONB NOT NULL DEFAULT '[]',
  source TEXT,
  drive_file_id TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (period_from, period_to),
  CHECK (period_to >= period_from)
);

-- Enable RLS
ALTER TABLE bookly_reports ENABLE ROW LEVEL SECURITY;

-- Allow all operations (public dashboard, no auth)
DO $$ BEGIN
  CREATE POLICY "Allow all on bookly_reports" ON bookly_reports
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Drive files that could not be read as a Bookly report (skip on next sync)
CREATE TABLE IF NOT EXISTS bookly_drive_skipped (
  file_id TEXT PRIMARY KEY,
  name TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE bookly_drive_skipped ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Allow all on bookly_drive_skipped" ON bookly_drive_skipped
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
