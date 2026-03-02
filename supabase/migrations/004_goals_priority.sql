-- Add priority to weekly goals (Eat That Frog ABCDE method)
ALTER TABLE weekly_goals ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'A' CHECK (priority IN ('A', 'B', 'C', 'D', 'E'));
ALTER TABLE weekly_goals ADD COLUMN IF NOT EXISTS sub_priority INT DEFAULT 1;
