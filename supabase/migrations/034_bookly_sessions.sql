-- Pojedyncze sesje czytania z Bookly (zrzuty "Reading Sessions")
CREATE TABLE IF NOT EXISTS bookly_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  title TEXT NOT NULL,          -- dokładnie jak w Bookly
  author TEXT,
  pages INT NOT NULL CHECK (pages >= 0),
  seconds INT NOT NULL CHECK (seconds >= 0),   -- READ TIME w sekundach
  source TEXT,                  -- 'drive' | 'upload'
  drive_file_id TEXT,           -- z którego zrzutu (pierwszy, który ją przyniósł)
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (date, title, pages, seconds)   -- ta sama sesja z nakładających się zrzutów = 1 wiersz
);
CREATE INDEX IF NOT EXISTS bookly_sessions_date_idx ON bookly_sessions (date);
ALTER TABLE bookly_sessions ENABLE ROW LEVEL SECURITY;
-- RLS włączone, BEZ polityk: dostęp tylko przez service role (API routes), tak jak bookly_reports.
