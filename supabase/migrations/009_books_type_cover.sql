-- Add type (reading/listening) and cover_url to books
ALTER TABLE books ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'reading' CHECK (type IN ('reading', 'listening'));
ALTER TABLE books ADD COLUMN IF NOT EXISTS cover_url TEXT;

CREATE INDEX IF NOT EXISTS idx_books_type ON books (type);
