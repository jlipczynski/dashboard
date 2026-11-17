-- Finanse 10: coach that learns — full conversation log + knowledge about Jan's finances.
-- Nothing becomes knowledge without Jan's approval: the coach/analysis only PROPOSE (status 'proposed').
-- RLS on with no policies (as all finance tables): access only through the service role in API routes.

create table if not exists finance_coach_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  step text,
  role text not null check (role in ('coach', 'jan')),
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists finance_coach_messages_session_idx on finance_coach_messages (session_id, created_at);
alter table finance_coach_messages enable row level security;

create table if not exists finance_coach_insights (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('fact', 'decision', 'rule', 'pattern', 'lesson')),
  text text not null,
  evidence jsonb,
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'rejected', 'retired')),
  valid_until date,
  source text not null check (source in ('coach', 'analysis', 'jan', 'seed')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists finance_coach_insights_status_idx on finance_coach_insights (status, created_at desc);
alter table finance_coach_insights enable row level security;

-- Seed: Jan's decisions of 17.11.2026, already accepted. Idempotent (skipped when any seed row exists).
insert into finance_coach_insights (kind, text, evidence, status, source, decided_at)
select v.kind, v.text, v.evidence::jsonb, 'accepted', 'seed', '2026-11-17T20:00:00Z'
from (values
  ('decision', 'Limit kosztów życia: 20 000 zł miesięcznie, liczone wszystkie wydatki, od 1.11.2026.',
   '{"decided":"2026-11-17","goal":"cost_of_living","monthly_limit":20000,"counts":"all","valid_from":"2026-11-01"}'),
  ('rule', 'Zakupy online powyżej 200 zł: zasada 48 godzin — najpierw wpis na listę planowanych zakupów.',
   '{"decided":"2026-11-17","threshold_zl":200,"wait_hours":48}'),
  ('rule', 'Limit kategorii Zakupy: 1 500 zł miesięcznie, od grudnia 2026.',
   '{"decided":"2026-11-17","category":"Zakupy","monthly_limit":1500,"valid_from":"2026-12-01"}'),
  ('fact', 'Apple: 2 roczne subskrypcje po 999,99 zł (5.11 i 13.11.2026) — do weryfikacji, czy obie są potrzebne.',
   '{"decided":"2026-11-17","payee":"APPLE.COM/BILL","amount":999.99,"dates":["2026-11-05","2026-11-13"],"to_verify":true}'),
  ('decision', 'Trener dzieci: 1 840 zł miesięcznie — decyzja odłożona na sesję WIG.',
   '{"decided":"2026-11-17","monthly":1840,"status":"deferred"}'),
  ('rule', 'Narzędzia firmowe opłacane prywatnie (np. Miro, ChatGPT) są zwracane przez firmę — każde takie narzędzie musi mieć zwrot.',
   '{"decided":"2026-11-17","examples":["Miro","ChatGPT"]}')
) as v(kind, text, evidence)
where not exists (select 1 from finance_coach_insights where source = 'seed');
