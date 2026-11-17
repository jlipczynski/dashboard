-- Finanse: the monthly spending limit is NOT approved yet.
-- 20 000 zł in Visionary OS is the target for income independent of work, not a cost-of-living limit.
-- The limit becomes an independent, editable value with a status; until Jan decides: 'pending' ("Do zatwierdzenia").
-- Nothing is deleted: the existing row keeps its value, every change is kept in finance_goal_history.

alter table finance_goals add column if not exists status text not null default 'pending';
alter table finance_goals drop constraint if exists finance_goals_status_check;
alter table finance_goals add constraint finance_goals_status_check check (status in ('pending', 'approved'));
alter table finance_goals add column if not exists approved_at timestamptz;
alter table finance_goals add column if not exists updated_at timestamptz not null default now();

create table if not exists finance_goal_history (
  id uuid primary key default gen_random_uuid(),
  goal_key text not null,
  monthly_limit numeric,
  status text,
  note text,
  changed_at timestamptz not null default now()
);
alter table finance_goal_history enable row level security;

-- Starting point of the history: the value seeded by migration 028, now marked as pending.
insert into finance_goal_history (goal_key, monthly_limit, status, note)
select key, monthly_limit, status, 'stan po migracji 028 — 20 000 zł to cel dochodu pasywnego (Visionary OS), nie zatwierdzony limit wydatków'
from finance_goals
where key = 'cost_of_living'
  and not exists (select 1 from finance_goal_history h where h.goal_key = 'cost_of_living');

-- E-mail import: ambiguous alerts left for manual review.
alter table finance_email_imports add column if not exists uncertain int not null default 0;
