-- Cover image cache for finished-book titles (Bookly shelf)
CREATE TABLE IF NOT EXISTS book_covers (
  title TEXT PRIMARY KEY,
  cover_url TEXT,
  fetched_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE book_covers ENABLE ROW LEVEL SECURITY;

-- RLS wlaczone, BEZ polityk: dostep tylko przez service role (API routes).
