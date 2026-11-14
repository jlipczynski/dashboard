-- Przeniesione z src/lib/migrations.ts (dawne /api/migrate).
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS tag TEXT;
