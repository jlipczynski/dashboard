-- Przeniesione z src/lib/migrations.ts (dawne /api/migrate).
CREATE TABLE IF NOT EXISTS finance_tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE finance_tags ENABLE ROW LEVEL SECURITY;
-- RLS wlaczone, BEZ polityk: dostep tylko przez service role (API routes).
