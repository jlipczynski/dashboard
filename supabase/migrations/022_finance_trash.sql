-- Finanse 03: kosz (soft delete). Wiersz z deleted_at zostaje w bazie, więc jego
-- import_hash dalej blokuje ponowny import tej samej transakcji.
alter table finance_transactions add column if not exists deleted_at timestamptz;
create index if not exists finance_transactions_deleted_at_idx
  on finance_transactions (deleted_at) where deleted_at is not null;
