-- Przeniesione z src/lib/migrations.ts (dawne /api/migrate).
CREATE TABLE IF NOT EXISTS finance_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE finance_categories ENABLE ROW LEVEL SECURITY;
-- RLS wlaczone, BEZ polityk: dostep tylko przez service role (API routes).

CREATE TABLE IF NOT EXISTS finance_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern TEXT NOT NULL UNIQUE,
  category_id UUID REFERENCES finance_categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE finance_rules ENABLE ROW LEVEL SECURITY;
-- RLS wlaczone, BEZ polityk: dostep tylko przez service role (API routes).

CREATE TABLE IF NOT EXISTS finance_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  description TEXT NOT NULL,
  counterparty TEXT,
  amount DECIMAL(12,2) NOT NULL,
  balance DECIMAL(12,2),
  category_id UUID REFERENCES finance_categories(id),
  import_hash TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE finance_transactions ENABLE ROW LEVEL SECURITY;
-- RLS wlaczone, BEZ polityk: dostep tylko przez service role (API routes).
CREATE INDEX IF NOT EXISTS idx_finance_transactions_date ON finance_transactions (date DESC);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_category ON finance_transactions (category_id);

INSERT INTO finance_categories (name, type) VALUES
  ('Travel', 'expense'),
  ('Mati USA', 'expense'),
  ('Zwierzaki', 'expense'),
  ('Rozrywka', 'expense'),
  ('Jedzenie na zewnątrz', 'expense'),
  ('Inne', 'expense'),
  ('Food & Drink', 'expense'),
  ('Kids sport', 'expense'),
  ('Transportation', 'expense'),
  ('Kids education', 'expense'),
  ('Housing & Utilities', 'expense'),
  ('Kids other', 'expense'),
  ('Personal Care', 'expense'),
  ('Shopping', 'expense'),
  ('Health Care', 'expense'),
  ('Membership', 'expense'),
  ('Giving', 'expense'),
  ('Maliny', 'income'),
  ('Salary', 'income'),
  ('Investment', 'income')
ON CONFLICT (name) DO NOTHING;
