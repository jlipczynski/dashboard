-- Finanse 09: "Coach wydatków" — WIG limit, planned purchases, decisions on big expenses, weekly reviews.
-- RLS on with no policies (as all finance tables): access only through the service role in API routes.

create table if not exists finance_goals (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  monthly_limit numeric not null check (monthly_limit > 0),
  counts text not null default 'all' check (counts in ('all', 'recurring')),
  valid_from date not null,
  created_at timestamptz not null default now()
);
alter table finance_goals enable row level security;
insert into finance_goals (key, monthly_limit, counts, valid_from)
  values ('cost_of_living', 20000, 'all', '2026-11-01')
  on conflict (key) do nothing;

create table if not exists finance_planned_purchases (
  id uuid primary key default gen_random_uuid(),
  month date not null check (extract(day from month) = 1),
  name text not null,
  amount numeric not null check (amount > 0),
  category_id uuid references finance_categories(id) on delete set null,
  status text not null default 'planned' check (status in ('planned', 'bought', 'dropped')),
  transaction_id uuid references finance_transactions(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists finance_planned_purchases_month_idx on finance_planned_purchases (month);
alter table finance_planned_purchases enable row level security;

create table if not exists finance_expense_decisions (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references finance_transactions(id) on delete cascade,
  necessary text not null check (necessary in ('yes', 'partly', 'no')),
  recurring boolean not null,
  horizon_until date,
  plan text,
  created_at timestamptz not null default now()
);
alter table finance_expense_decisions enable row level security;

create table if not exists finance_weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  month_forecast numeric,
  commitment text,
  coach_summary text,
  completed_at timestamptz
);
alter table finance_weekly_reviews enable row level security;
