-- Daily entries for Rozwoj Osobisty (reading, listening, writing)
CREATE TABLE IF NOT EXISTS rozwoj_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  area TEXT NOT NULL CHECK (area IN ('czytanie', 'sluchanie', 'pisanie')),
  date DATE NOT NULL,
  amount INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(area, date)
);

-- Enable RLS
ALTER TABLE rozwoj_entries ENABLE ROW LEVEL SECURITY;

-- RLS wlaczone, BEZ polityk: dostep tylko przez service role (API routes).

-- Index for fast queries by area and date
CREATE INDEX IF NOT EXISTS idx_rozwoj_entries_area_date ON rozwoj_entries (area, date DESC);
