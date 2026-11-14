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

-- RLS wlaczone, BEZ polityk: dostep tylko przez service role (API routes).
