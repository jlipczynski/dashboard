-- Finanse 08: nightly import of Erste "Alerty24" e-mails from Gmail.
-- source: where a transaction came from (null = older rows). email_message_id: Gmail message id (dedup).
alter table finance_transactions add column if not exists source text;
alter table finance_transactions drop constraint if exists finance_transactions_source_check;
alter table finance_transactions add constraint finance_transactions_source_check
  check (source is null or source in ('csv', 'email', 'cash'));
alter table finance_transactions add column if not exists email_message_id text;
create unique index if not exists finance_transactions_email_message_id_key
  on finance_transactions (email_message_id) where email_message_id is not null;

-- Google refresh token for the nightly job, AES-256-GCM encrypted with FINANCE_TOKEN_KEY (never plain).
create table if not exists finance_google_tokens (
  user_email text primary key,
  refresh_token_enc text not null,
  updated_at timestamptz not null default now()
);
alter table finance_google_tokens enable row level security;

-- One row per import run (cron or the "Pobierz alerty teraz" button).
create table if not exists finance_email_imports (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  trigger text,
  fetched int not null default 0,
  inserted int not null default 0,
  matched_rules int not null default 0,
  ai_suggested int not null default 0,
  unparsed int not null default 0,
  errors jsonb
);
alter table finance_email_imports enable row level security;
