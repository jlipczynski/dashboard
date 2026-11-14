-- Przeniesione z src/lib/migrations.ts (dawne /api/migrate).
CREATE TABLE IF NOT EXISTS finance_subcategories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category_id UUID REFERENCES finance_categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (name, category_id)
);
ALTER TABLE finance_subcategories ENABLE ROW LEVEL SECURITY;
-- RLS wlaczone, BEZ polityk: dostep tylko przez service role (API routes).

ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS subcategory_id UUID REFERENCES finance_subcategories(id);
ALTER TABLE finance_rules ADD COLUMN IF NOT EXISTS subcategory_id UUID REFERENCES finance_subcategories(id);

INSERT INTO finance_subcategories (name, category_id)
SELECT sub.name, fc.id
FROM (VALUES
  ('Gaz'), ('Prąd'), ('Woda'), ('Ochrona'),
  ('Podatek od nieruchomości'), ('Internet'), ('Ogród'),
  ('Sprzątanie'), ('Czynsz/Hipoteka'), ('Ubezpieczenie domu'),
  ('Naprawy i remonty'), ('Śmieci')
) AS sub(name)
CROSS JOIN finance_categories fc
WHERE fc.name = 'Housing & Utilities'
ON CONFLICT (name, category_id) DO NOTHING;
