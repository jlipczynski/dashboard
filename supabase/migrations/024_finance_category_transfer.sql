-- Finanse 04b: category type "transfer" — own-account transfers and savings goals are
-- neither an expense nor income. The former "Investment" category becomes that type.
alter table finance_categories drop constraint if exists finance_categories_type_check;
alter table finance_categories add constraint finance_categories_type_check
  check (type in ('expense', 'income', 'transfer'));
update finance_categories set type = 'transfer', name = 'Oszczędności (przelewy własne)'
  where name = 'Investment';
