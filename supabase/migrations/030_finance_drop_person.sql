-- Finanse: the "person" field is removed completely (Jan, 2026-11-17).
-- Backup of the non-empty values (id, person) — 46 rows: backups/2026-11-17_finance_transactions_person.json
-- The application code stopped reading/writing this column before this migration was applied.
alter table finance_transactions drop column if exists person;
