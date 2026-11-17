-- "Moja liczba wolności": Jan's saved simulations. Each row keeps ALL parameters, the creation date and where the
-- default values came from. Rows are only inserted — never overwritten when the cost of living changes.
-- RLS on with no policies (as all finance tables): access only through the service role in API routes.

create table if not exists finance_freedom_scenarios (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  params jsonb not null,
  data_source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists finance_freedom_scenarios_created_idx on finance_freedom_scenarios (created_at desc);
alter table finance_freedom_scenarios enable row level security;
