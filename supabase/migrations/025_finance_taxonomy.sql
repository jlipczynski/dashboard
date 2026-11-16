-- Finanse 05: nowa taksonomia (decyzja Jana 2026-11-16).
-- Kategoria = "na co", tagi = "dla kogo / gdzie / projekt", podkategoria ma rodzaj
-- (stałe / niezbędne / uznaniowe), a przegląd tygodniowy zapisuje reviewed_at.
alter table finance_categories add column if not exists icon text;
alter table finance_categories add column if not exists color text;
alter table finance_categories add column if not exists sort_order int not null default 100;

alter table finance_subcategories add column if not exists kind text;
alter table finance_subcategories drop constraint if exists finance_subcategories_kind_check;
alter table finance_subcategories add constraint finance_subcategories_kind_check
  check (kind is null or kind in ('fixed', 'essential', 'discretionary'));
alter table finance_subcategories add column if not exists sort_order int not null default 100;

-- Tagi w czterech wymiarach. Kolumna `tag` zostaje jako "Projekt" (np. "USA 2026").
alter table finance_transactions add column if not exists person text;
alter table finance_transactions add column if not exists place text;
alter table finance_transactions add column if not exists one_off boolean not null default false;
alter table finance_transactions add column if not exists reviewed_at timestamptz;
create index if not exists finance_transactions_unreviewed_idx
  on finance_transactions (date) where reviewed_at is null and deleted_at is null;
