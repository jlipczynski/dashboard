-- Add audio_file_id to backlog_items for linking back to Drive files
ALTER TABLE backlog_items
  ADD COLUMN IF NOT EXISTS audio_file_id TEXT;

-- Ensure backlog_audio_processed exists (idempotent)
CREATE TABLE IF NOT EXISTS backlog_audio_processed (
  file_id      TEXT PRIMARY KEY,
  filename     TEXT NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT now(),
  items_count  INT DEFAULT 0
);
