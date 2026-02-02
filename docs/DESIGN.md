# ContextVault — Design Document

**Purpose:** Automatic context preservation that survives compaction.  
**Author:** Pekka  
**Date:** 2026-02-02  
**Status:** Implemented

---

## Problem Statement

1. Context grows → hits 200k limit → compaction
2. Summary sometimes fails ("summary unavailable")
3. Working memory is lost mid-conversation
4. Recovery is manual (HANDOFF.md) and incomplete
5. No automatic history of what happened

**Goal:** Never lose context state. Automatic capture, easy recovery.

---

## Design Principles

### 1. Append-Only Storage

Messages are never modified or deleted. This ensures:
- Complete audit trail
- No data loss from bugs
- Simple conflict resolution (last write wins for metadata only)

### 2. Local-First

All data stays on the local machine:
- No API costs
- No network latency
- Full data ownership
- Works offline

### 3. Minimal Dependencies

- SQLite (via better-sqlite3) — battle-tested, zero-config
- Node.js standard library
- No external services

### 4. Non-Invasive

ContextVault reads OpenClaw's session files but never modifies them:
- OpenClaw continues to work normally
- ContextVault can be added/removed without impact
- No risk of corrupting OpenClaw state

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         OpenClaw                                 │
│                    ~/.openclaw/agents/*/sessions/                │
└──────────────────────────┬──────────────────────────────────────┘
                           │ (file changes)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SessionWatcher                               │
│              (detects new messages, compactions)                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ContextVault                                │
│                    (SQLite Database)                             │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  messages   │  │  snapshots  │  │ compactions │              │
│  │ (append-only)│  │  (named)    │  │  (events)   │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                         CLI / API                                │
│                                                                  │
│  context-vault snapshot "before-migration"                       │
│  context-vault recover --last 50                                 │
│  context-vault search "what did we decide about X"               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Model

### Sessions Table

Tracks each conversation session.

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,           -- e.g., "agent:main:main"
  agent_id TEXT,
  created_at INTEGER,
  last_activity INTEGER,
  total_messages INTEGER DEFAULT 0
);
```

### Messages Table

Append-only log of all messages.

```sql
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  message_index INTEGER,         -- position in conversation
  role TEXT NOT NULL,            -- user/assistant/system
  content TEXT,                  -- message content
  timestamp INTEGER NOT NULL,
  metadata TEXT                  -- JSON for extras
);
```

### FTS5 Index

Full-text search using SQLite's FTS5 extension.

```sql
CREATE VIRTUAL TABLE messages_fts USING fts5(
  content,
  content='messages',
  content_rowid='id'
);

-- Auto-sync trigger
CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
END;
```

### Snapshots Table

Named checkpoints for time-travel.

```sql
CREATE TABLE snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  name TEXT NOT NULL,            -- "before-migration"
  trigger TEXT,                  -- "manual" / "auto" / "pre-compaction"
  message_count INTEGER,
  created_at INTEGER NOT NULL,
  last_message_id INTEGER        -- reference point
);
```

### Compactions Table

Track when context was compacted.

```sql
CREATE TABLE compactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  messages_before INTEGER,
  messages_after INTEGER,
  summary_available INTEGER DEFAULT 0
);
```

---

## Key Algorithms

### Session File Parsing

OpenClaw stores sessions as JSONL files:

```jsonl
{"type":"session","id":"abc123","timestamp":1706875200}
{"type":"message","message":{"role":"user","content":[{"type":"text","text":"Hello"}]}}
{"type":"message","message":{"role":"assistant","content":[{"type":"text","text":"Hi!"}]}}
```

The parser:
1. Reads each line as JSON
2. Extracts session metadata from `type: "session"`
3. Extracts messages from `type: "message"`
4. Handles both string and array content formats
5. Skips malformed lines gracefully

### Compaction Detection

Compaction is detected when message count drops:

```javascript
if (lastInfo.messageCount > 0 && messages.length < lastInfo.messageCount - 5) {
  // Compaction detected!
  vault.recordCompaction(sessionId, {
    messagesBefore: lastInfo.messageCount,
    messagesAfter: messages.length,
    summaryAvailable: true // Conservative assumption
  });
}
```

The 5-message threshold prevents false positives from normal message deletion.

### Incremental Sync

Only new messages are synced:

```javascript
const existingCount = vault.getSessionStats(sessionId).messageCount;

for (let i = existingCount; i < messages.length; i++) {
  vault.appendMessage(sessionId, messages[i]);
}
```

This makes sync efficient even with large sessions.

---

## Performance Considerations

### SQLite WAL Mode

Write-Ahead Logging enables:
- Concurrent readers during writes
- Better crash recovery
- Improved write performance

```javascript
this.db.pragma('journal_mode = WAL');
```

### Indexes

Strategic indexes for common queries:

```sql
CREATE INDEX idx_messages_session ON messages(session_id, timestamp);
CREATE INDEX idx_snapshots_session ON snapshots(session_id);
CREATE INDEX idx_compactions_session ON compactions(session_id);
```

### FTS5 vs. LIKE

Full-text search is 10-100x faster than LIKE queries:

```sql
-- Slow (scans all rows)
SELECT * FROM messages WHERE content LIKE '%database%';

-- Fast (uses FTS index)
SELECT * FROM messages_fts WHERE messages_fts MATCH 'database';
```

---

## Security Considerations

### Data at Rest

Currently unencrypted. Future enhancement: SQLCipher for encryption.

### File Permissions

Database created with user-only permissions:
- `~/.openclaw/context-vault/` — 700
- `vault.db` — 600

### No Network

All operations are local. No data leaves the machine.

---

## Comparison with Alternatives

### vs. UltraContext

| Feature | UltraContext | ContextVault |
|---------|--------------|--------------|
| Auto-capture | ✅ API-based | ✅ File watcher |
| Versioning | ✅ Per-change | ✅ Snapshots |
| Full-text search | ❌ | ✅ SQLite FTS5 |
| Semantic search | ❌ | 🔮 Future |
| Offline | ❌ | ✅ |
| Cost | 💰 API fees | ✅ Free |
| Latency | ~100ms | ~1ms |
| Data ownership | ❓ Cloud | ✅ Full |

### vs. Manual HANDOFF.md

| Feature | HANDOFF.md | ContextVault |
|---------|------------|--------------|
| Automatic | ❌ Manual | ✅ Auto-sync |
| Complete | ❌ Partial | ✅ All messages |
| Searchable | ❌ | ✅ FTS5 |
| Time-travel | ❌ | ✅ Snapshots |
| Effort | High | Zero |

---

## Future Enhancements

### Phase 2: Semantic Search

Add embeddings for concept-based search:

```javascript
// "Find messages about deployment" even if word isn't used
vault.semanticSearch('deployment strategy');
```

Implementation: Local embeddings via Ollama or cached OpenAI.

### Phase 3: Web UI

Visual browser for conversation history:
- Timeline view
- Search interface
- Snapshot management
- Analytics dashboard

### Phase 4: Multi-Agent Tracking

Track conversations between agents:
- Agent-to-agent messages
- Delegation chains
- Worker outputs

### Phase 5: Encryption

SQLCipher integration for encrypted storage:

```javascript
const vault = new ContextVault(dbPath, { encrypted: true, key: '...' });
```

---

## Failure Modes

### Database Corruption

SQLite is robust, but corruption can happen:

**Mitigation:**
- WAL mode for crash safety
- Regular backups (via Time Machine)
- FTS rebuild command available

**Recovery:**
```bash
sqlite3 vault.db ".recover" | sqlite3 vault-recovered.db
```

### Disk Full

**Mitigation:**
- Check disk space before writes
- Alert when <1GB remaining
- Prune command for old data

### Session File Format Change

If OpenClaw changes file format:

**Mitigation:**
- Version detection in parser
- Graceful degradation (skip unparseable)
- Alert on parse errors

---

## Metrics to Track

For production monitoring:

```javascript
const metrics = {
  messagesPerDay: 0,
  syncLatencyMs: 0,
  searchLatencyMs: 0,
  dbSizeBytes: 0,
  compactionsDetected: 0,
  parseErrors: 0
};
```

---

## Summary

ContextVault provides a safety net for Claude's context limitations:

✅ **Automatic** — No manual intervention needed  
✅ **Complete** — Every message captured  
✅ **Searchable** — Find anything instantly  
✅ **Recoverable** — One command after compaction  
✅ **Local** — No costs, no latency, full ownership  

The key insight: **Compaction is a Claude limit, not a storage limit.** We just need to store context externally and make recovery easy.
