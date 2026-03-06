ALTER TABLE weekly_tasks ADD COLUMN IF NOT EXISTS backlog_item_id UUID REFERENCES backlog_items(id);
CREATE INDEX IF NOT EXISTS idx_weekly_backlog ON weekly_tasks(backlog_item_id);
