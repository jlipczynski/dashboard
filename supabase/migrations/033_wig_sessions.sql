-- WIG Sessions 1.0 (docs/JAN_DASHBOARD_WIG_SPEC_2026-11-22.md). ADDITIVE ONLY: new tables + 3 nullable columns on
-- weekly_tasks. No existing row is changed or deleted; legacy scoring (incl. the +2 WIG text bonus) is untouched.
-- RLS on with no policies (as all tables here): access only through the service role / DATABASE_URL in API routes.
-- Weeks are Monday dates in Europe/Warsaw (src/lib/dates.ts).

-- One row per week: the plan (draft → approved, frozen snapshot) and the close status.
create table if not exists wig_weeks (
  week_start date primary key check (extract(isodow from week_start) = 1),
  plan_status text not null default 'robocza' check (plan_status in ('robocza', 'zatwierdzony')),
  plan_approved_at timestamptz,
  plan_snapshot jsonb,
  area_skip jsonb not null default '{}'::jsonb,      -- {"praca": "urlop"}: area without goals this week, with a reason
  reflection jsonb not null default '{}'::jsonb,     -- {"zdrowie": {"worked": "", "didnt": "", "correction": ""}}
  close_status text check (close_status in ('zamknieta', 'skorygowana')),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Weekly LEADs (numeric areas). lead_key = stable id across weeks (for the 4-week window).
create table if not exists wig_leads (
  id uuid primary key default gen_random_uuid(),
  week_start date not null references wig_weeks (week_start) on delete cascade,
  area_key text not null check (area_key in ('rozwoj', 'zdrowie', 'praca')),
  lead_key text not null check (lead_key ~ '^[a-z0-9-]{1,60}$'),
  name text not null check (char_length(name) between 1 and 120),
  unit text not null default '' check (char_length(unit) <= 30),
  direction text not null default 'at_least' check (direction in ('at_least', 'at_most', 'range')),
  target numeric not null check (target > 0),
  target_max numeric check (target_max is null or target_max >= target),
  weight numeric not null check (weight > 0 and weight <= 100),
  source text not null default 'manual' check (source in ('manual', 'rehab_days', 'calories_week', 'reading_minutes', 'audiobook_minutes', 'garmin_strength', 'garmin_cycling', 'garmin_running', 'task')),
  notes text not null default '',
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (week_start, lead_key)
);
create index if not exists wig_leads_week_idx on wig_leads (week_start, area_key, position);

-- Execution of a LEAD. Append-only: every save is a new revision; the current value = highest revision.
create table if not exists wig_results (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references wig_leads (id) on delete cascade,
  week_start date not null,
  revision int not null,
  actual numeric check (actual is null or actual >= 0),
  status text not null check (status in ('measured', 'manual', 'zero_confirmed', 'excused')),
  source_value numeric,                              -- what the automatic source said when this was saved
  evidence text not null default '',
  reason text not null default '',                   -- required for corrections after the week is closed
  created_at timestamptz not null default now(),
  unique (lead_id, revision)
);

-- Relacje: weekly "rachunek sumienia" per sub-area. Append-only revisions, current = highest revision.
create table if not exists wig_relation_reviews (
  id uuid primary key default gen_random_uuid(),
  week_start date not null references wig_weeks (week_start) on delete cascade,
  sub_key text not null check (sub_key in ('monika', 'dzieci', 'przyjaciele', 'pozostali')),
  revision int not null,
  intention text not null default '',
  did_well text not null default '',
  did_wrong text not null default '',
  impact text not null default '',
  do_differently text not null default '',
  rating int check (rating between 1 and 6),
  excused boolean not null default false,
  reason text not null default '',
  created_at timestamptz not null default now(),
  unique (week_start, sub_key, revision)
);

-- Week close: immutable snapshot per version (1 = close, 2+ = corrections with a reason).
create table if not exists wig_week_closes (
  id uuid primary key default gen_random_uuid(),
  week_start date not null references wig_weeks (week_start) on delete cascade,
  version int not null,
  algorithm_version text not null,
  reason text not null default '',
  snapshot jsonb not null,
  closed_at timestamptz not null default now(),
  unique (week_start, version)
);

-- Audit trail: plan revisions after approval, skips, reopen etc.
create table if not exists wig_events (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  reason text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists wig_events_week_idx on wig_events (week_start, created_at);

-- Context per area: the WIG text (long-term goal).
create table if not exists wig_area_context (
  area_key text primary key check (area_key in ('rozwoj', 'zdrowie', 'praca', 'relacje')),
  wig text not null default '',
  updated_at timestamptz not null default now()
);

-- LAGs: results shown separately, never part of the 1–6 score. Progress = sum of a LEAD (lead_key) in closed weeks
-- plus start_value, or a manual current value.
create table if not exists wig_lags (
  id uuid primary key default gen_random_uuid(),
  area_key text not null check (area_key in ('rozwoj', 'zdrowie', 'praca', 'relacje')),
  name text not null check (char_length(name) between 1 and 120),
  unit text not null default '',
  target numeric,
  deadline date,
  lead_key text,
  start_value numeric not null default 0,
  manual_value numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Monthly goals: direction + progress view only (no second score component).
create table if not exists wig_monthly_goals (
  id uuid primary key default gen_random_uuid(),
  month date not null check (extract(day from month) = 1),
  area_key text not null check (area_key in ('rozwoj', 'zdrowie', 'praca', 'relacje')),
  name text not null check (char_length(name) between 1 and 120),
  unit text not null default '',
  target numeric,
  lead_key text,
  manual_value numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ROCKS: quarterly key projects / milestones, separate from weekly LEADs.
create table if not exists rocks (
  id uuid primary key default gen_random_uuid(),
  quarter text not null check (quarter ~ '^\d{4}-Q[1-4]$'),
  area_key text not null check (area_key in ('rozwoj', 'zdrowie', 'praca', 'relacje')),
  title text not null check (char_length(title) between 1 and 160),
  owner text not null default 'Jan',
  milestone text not null default '',
  due date,
  status text not null default 'planowany' check (status in ('planowany', 'w_toku', 'zrobiony', 'porzucony')),
  wig text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- weekly_tasks: optional links. project stays the business project (Ovoc / Plantacja / Inne); area_key is the life
-- area, so the two are no longer mixed for new tasks. Existing rows keep NULL.
alter table weekly_tasks add column if not exists area_key text check (area_key in ('rozwoj', 'zdrowie', 'praca', 'relacje'));
alter table weekly_tasks add column if not exists wig_lead_id uuid references wig_leads (id) on delete set null;
alter table weekly_tasks add column if not exists rock_id uuid references rocks (id) on delete set null;
create index if not exists weekly_tasks_wig_lead_idx on weekly_tasks (wig_lead_id) where wig_lead_id is not null;

alter table wig_weeks enable row level security;
alter table wig_leads enable row level security;
alter table wig_results enable row level security;
alter table wig_relation_reviews enable row level security;
alter table wig_week_closes enable row level security;
alter table wig_events enable row level security;
alter table wig_area_context enable row level security;
alter table wig_lags enable row level security;
alter table wig_monthly_goals enable row level security;
alter table rocks enable row level security;
