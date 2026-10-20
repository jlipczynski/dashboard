-- Cover image cache for finished-book titles (Bookly shelf)
CREATE TABLE IF NOT EXISTS book_covers (
  title TEXT PRIMARY KEY,
  cover_url TEXT,
  fetched_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE book_covers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Allow all on book_covers" ON book_covers
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
