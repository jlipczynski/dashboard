-- Finanse 05: rules by recipient + transfer title.
-- counterparty_pattern = recipient (null → pattern-only rule, as before).
alter table finance_rules add column if not exists counterparty_pattern text;

-- Uniqueness moves from (pattern) to the pair. NULLS NOT DISTINCT (Postgres 15+) keeps "one pattern-only
-- rule per pattern", and — unlike an index on coalesce(...) — can be targeted by
-- upsert(..., { onConflict: "pattern,counterparty_pattern" }) from supabase-js.
alter table finance_rules drop constraint if exists finance_rules_pattern_key;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'finance_rules_pattern_cp_key') then
    alter table finance_rules
      add constraint finance_rules_pattern_cp_key unique nulls not distinct (pattern, counterparty_pattern);
  end if;
end $$;
