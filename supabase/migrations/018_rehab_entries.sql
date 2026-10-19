-- Daily rehabilitation (physiotherapy) progress: % of prescribed exercises done
CREATE TABLE IF NOT EXISTS rehab_entries (
  date DATE PRIMARY KEY,
  percent INT NOT NULL CHECK (percent BETWEEN 0 AND 100),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE rehab_entries ENABLE ROW LEVEL SECURITY;

-- Allow all operations (public dashboard, no auth)
DO $$ BEGIN
  CREATE POLICY "Allow all on rehab_entries" ON rehab_entries
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
