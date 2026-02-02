# Changelog

All notable changes to ContextVault will be documented in this file.

## [1.0.0] - 2026-02-02

### Added

- **Core Features**
  - SQLite-based message storage with WAL mode
  - Full-text search via FTS5
  - Named snapshots for checkpoints
  - Compaction event tracking
  - Recovery file generation

- **CLI Commands**
  - `sync` — Sync all OpenClaw sessions
  - `watch` — Continuous sync daemon
  - `search` — Full-text search
  - `history` — View recent messages
  - `snapshot` — Create named checkpoint
  - `snapshots` — List checkpoints
  - `recover` — Generate recovery file
  - `stats` — Show statistics
  - `sessions` — List tracked sessions
  - `export` — Export session to markdown
  - `add` — Manually add message (testing)
  - `compaction` — Record compaction event

- **Session Watcher**
  - Automatic detection of new messages
  - Compaction detection
  - Incremental sync (only new messages)

- **Documentation**
  - Comprehensive README
  - API reference
  - Design document
  - Troubleshooting guide

### Technical Details

- **Dependencies:** better-sqlite3, commander
- **Node version:** 18+
- **Database:** SQLite with FTS5 extension
- **Storage:** `~/.openclaw/context-vault/vault.db`

## Future Plans

### [1.1.0] - Planned

- [ ] Semantic search via local embeddings
- [ ] Prune command for old data
- [ ] Export to JSON format
- [ ] Session diff command

### [1.2.0] - Planned

- [ ] Web UI for browsing history
- [ ] Analytics dashboard
- [ ] Token usage tracking

### [2.0.0] - Planned

- [ ] Encryption at rest (SQLCipher)
- [ ] Multi-agent tracking
- [ ] Cross-session search
