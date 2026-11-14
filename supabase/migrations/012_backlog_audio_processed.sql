CREATE TABLE IF NOT EXISTS backlog_audio_processed (
  file_id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT now(),
  items_count INT DEFAULT 0
);

-- RLS wlaczone, BEZ polityk: dostep tylko przez service role (API routes).
ALTER TABLE backlog_audio_processed ENABLE ROW LEVEL SECURITY;
