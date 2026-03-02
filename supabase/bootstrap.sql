-- Bootstrap: run ONCE in Supabase SQL Editor
-- Creates the run_migration() function used by /api/migrate (HTTPS-based)

-- 1. Migration tracking table
CREATE TABLE IF NOT EXISTS _migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT now()
);

-- 2. RPC function called by /api/migrate via supabase.rpc()
CREATE OR REPLACE FUNCTION run_migration(p_name text, p_sql text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Skip if already applied
  IF EXISTS (SELECT 1 FROM _migrations WHERE name = p_name) THEN
    RETURN 'skipped';
  END IF;

  -- Execute the migration SQL
  EXECUTE p_sql;

  -- Record it
  INSERT INTO _migrations (name) VALUES (p_name);
  RETURN 'applied';
END;
$$;

-- 3. Only service_role can call this function (not anon)
REVOKE EXECUTE ON FUNCTION run_migration(text, text) FROM public;
REVOKE EXECUTE ON FUNCTION run_migration(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION run_migration(text, text) TO service_role;

-- 4. Mark existing tables as migrated + apply pending migrations
INSERT INTO _migrations (name) VALUES ('001_weekly_goals.sql') ON CONFLICT DO NOTHING;
INSERT INTO _migrations (name) VALUES ('002_weekly_tasks.sql') ON CONFLICT DO NOTHING;
INSERT INTO _migrations (name) VALUES ('003_nutrition_log.sql') ON CONFLICT DO NOTHING;

-- Apply 004 now
ALTER TABLE weekly_goals ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'A' CHECK (priority IN ('A', 'B', 'C', 'D', 'E'));
ALTER TABLE weekly_goals ADD COLUMN IF NOT EXISTS sub_priority INT DEFAULT 1;
INSERT INTO _migrations (name) VALUES ('004_goals_priority.sql') ON CONFLICT DO NOTHING;
