-- RLS Hardening: remove anon/public access, keep service_role only
-- Run manually in Supabase SQL Editor after reviewing each statement.
-- service_role bypasses RLS, so no explicit policies needed for it.

-- 1. Drop overly permissive policies (allow-all for any role)
-- These were auto-created with "USING (true) WITH CHECK (true)"

DO $$
DECLARE
  tbl TEXT;
  pol RECORD;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'weekly_tasks', 'backlog_items', 'backlog_audio_processed',
      'books', 'book_readings', 'book_covers',
      'bookly_reports', 'bookly_drive_skipped',
      'rozwoj_entries', 'fitness_goals', 'nutrition_log', 'rehab_entries',
      'finance_transactions', 'finance_categories', 'finance_subcategories',
      'finance_tags', 'finance_category_tags', 'finance_rules',
      'work_checkins', 'weekly_goals'
    ])
  LOOP
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, tbl);
      RAISE NOTICE 'Dropped policy % on %', pol.policyname, tbl;
    END LOOP;
  END LOOP;
END $$;

-- 2. Ensure RLS is enabled on all tables (including _migrations)
ALTER TABLE IF EXISTS _migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS weekly_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS backlog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS backlog_audio_processed ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS books ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS book_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS book_covers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bookly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bookly_drive_skipped ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS rozwoj_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS fitness_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS nutrition_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS rehab_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS finance_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS finance_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS finance_subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS finance_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS finance_category_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS finance_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS work_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS weekly_goals ENABLE ROW LEVEL SECURITY;

-- 3. Verify: after running, check with:
-- SELECT schemaname, tablename, policyname, roles FROM pg_policies WHERE schemaname = 'public';
-- Expected: empty (no policies). service_role bypasses RLS automatically.
