-- ContextVault Schema
-- Local context memory system

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  agent_id TEXT,
  created_at INTEGER,
  last_activity INTEGER,
  total_messages INTEGER DEFAULT 0
);

-- Messages table (append-only)
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  message_index INTEGER,
  role TEXT NOT NULL,
  content TEXT,
  timestamp INTEGER NOT NULL,
  metadata TEXT
);

-- FTS5 full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  content,
  content='messages',
  content_rowid='id'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
END;

-- Snapshots
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  name TEXT NOT NULL,
  trigger TEXT,
  message_count INTEGER,
  created_at INTEGER NOT NULL,
  last_message_id INTEGER
);

-- Compactions
CREATE TABLE IF NOT EXISTS compactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  messages_before INTEGER,
  messages_after INTEGER,
  summary_available INTEGER DEFAULT 0
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_snapshots_session ON snapshots(session_id);
CREATE INDEX IF NOT EXISTS idx_compactions_session ON compactions(session_id);
