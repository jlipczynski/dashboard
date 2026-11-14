-- Przeniesione z src/lib/migrations.ts (dawne /api/migrate).
CREATE TABLE IF NOT EXISTS finance_category_tags (
  category_id UUID REFERENCES finance_categories(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES finance_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (category_id, tag_id)
);
ALTER TABLE finance_category_tags ENABLE ROW LEVEL SECURITY;
-- RLS wlaczone, BEZ polityk: dostep tylko przez service role (API routes).
