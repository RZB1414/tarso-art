CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  blocked_until INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  success INTEGER NOT NULL,
  ip_hash TEXT NOT NULL,
  user_agent TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_events_created_at ON auth_events (created_at);
CREATE INDEX IF NOT EXISTS idx_auth_events_type ON auth_events (type);
