-- Kolumny uzywane przez /finanse (import: merchant, edycja: notes).
-- Wczesniej dodawane w runtime przez lib/finanse-db.ts — teraz tylko migracja.
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS merchant TEXT;
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS notes TEXT;
