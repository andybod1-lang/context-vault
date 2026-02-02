# ContextVault

**Local context memory system that survives compaction.**

ContextVault automatically captures every OpenClaw conversation message into a local SQLite database. When context compacts (and summaries fail), you can recover your full conversation history instantly.

## Why ContextVault?

OpenClaw has a 200k token context limit. When exceeded:
1. Context compacts to fit
2. A summary is generated (sometimes fails → "summary unavailable")
3. Working memory is lost

**ContextVault solves this** by storing every message externally. No matter what happens to Claude's context, your conversation history is safe.

## Features

- 🔄 **Auto-sync** — Watches OpenClaw sessions, captures all messages
- 🔍 **Full-text search** — Find anything across all conversations
- 📸 **Snapshots** — Named checkpoints before risky operations
- 🚀 **Instant recovery** — Generate recovery file in milliseconds
- 💾 **Local-first** — No API costs, no network, full data ownership
- ⚡ **Fast** — SQLite FTS5, ~1ms queries

## Quick Start

```bash
# Install dependencies
cd projects/014-context-vault
npm install

# Sync all sessions
./bin/context-vault sync

# Search your history
./bin/context-vault search "what did we decide"

# Create a snapshot before risky operation
./bin/context-vault snapshot "before-migration"

# After compaction, recover context
./bin/context-vault recover --last 50
```

## Installation

### Prerequisites
- Node.js 18+
- OpenClaw installed and running

### Setup

```bash
cd projects/014-context-vault
npm install

# Link CLI globally (optional)
npm link

# Or use directly
./bin/context-vault --help
```

### Auto-sync (Recommended)

Add to crontab for continuous sync:

```bash
# Every minute
* * * * * /Users/antti/clawd/projects/014-context-vault/bin/context-vault sync >> /tmp/context-vault.log 2>&1
```

Or run as daemon:
```bash
./bin/context-vault watch
```

## Commands

| Command | Description |
|---------|-------------|
| `sync` | Sync all OpenClaw sessions to vault |
| `watch` | Continuous sync (daemon mode) |
| `search <query>` | Full-text search across all messages |
| `history` | View recent messages |
| `snapshot <name>` | Create named checkpoint |
| `snapshots` | List all snapshots |
| `recover` | Generate recovery file after compaction |
| `stats` | Show vault statistics |

## Usage Examples

### Search All History

```bash
# Find discussions about a topic
./bin/context-vault search "database migration"

# Limit results
./bin/context-vault search "API design" --limit 5

# Search specific session
./bin/context-vault search "bug" --session "agent:main:main"
```

### View History

```bash
# Last 20 messages (default)
./bin/context-vault history

# Last 100 messages
./bin/context-vault history --last 100

# Specific session
./bin/context-vault history --session "agent:main:main" --last 50
```

### Snapshots

```bash
# Create before risky operation
./bin/context-vault snapshot "before-refactor"

# Auto-snapshot (use in scripts)
./bin/context-vault snapshot "auto-$(date +%Y%m%d-%H%M)"

# List all snapshots
./bin/context-vault snapshots
```

### Recovery After Compaction

```bash
# Generate recovery file (last 50 messages)
./bin/context-vault recover

# More messages
./bin/context-vault recover --last 100

# Custom output path
./bin/context-vault recover --output ~/recovery.md

# Then read the file to restore context
cat /tmp/context-recovery-*.md
```

### Statistics

```bash
./bin/context-vault stats

# Output:
# 📊 ContextVault Stats
#
#    Sessions:    1,163
#    Messages:    15,315
#    Snapshots:   3
#    Compactions: 4
```

## Integration with OpenClaw

### HEARTBEAT.md Integration

Add to your heartbeat checks:

```markdown
## Context Monitoring

1. Check context % with `session_status`
2. If > 70%: `context-vault snapshot "auto-YYYYMMDD-HHMM"`
3. If > 85%: Alert + prepare recovery
```

### Post-Compaction Protocol

When context compacts:

```bash
# 1. Generate recovery file
./bin/context-vault recover --last 50

# 2. Read and process
cat /tmp/context-recovery-*.md

# 3. Update HANDOFF.md with key context
```

### Launchd Daemon (macOS)

Create `~/Library/LaunchAgents/com.openclaw.contextvault.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.openclaw.contextvault</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/antti/clawd/projects/014-context-vault/bin/context-vault</string>
        <string>watch</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/context-vault.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/context-vault.err</string>
</dict>
</plist>
```

Load with:
```bash
launchctl load ~/Library/LaunchAgents/com.openclaw.contextvault.plist
```

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

## Data Storage

**Database location:** `~/.openclaw/context-vault/vault.db`

SQLite with WAL mode for concurrent access. Uses FTS5 for full-text search.

### Tables

| Table | Purpose |
|-------|---------|
| `sessions` | Track each conversation |
| `messages` | Append-only message log |
| `messages_fts` | Full-text search index |
| `snapshots` | Named checkpoints |
| `compactions` | Compaction events |

## Comparison with UltraContext

| Feature | UltraContext | ContextVault |
|---------|--------------|--------------|
| Auto-capture | ✅ API-based | ✅ File watcher |
| Versioning | ✅ Per-change | ✅ Snapshots |
| Full-text search | ❌ | ✅ SQLite FTS5 |
| Offline | ❌ | ✅ |
| Cost | 💰 API fees | ✅ Free |
| Latency | ~100ms | ~1ms |
| Data ownership | ❓ Cloud | ✅ Local |

## Files

```
projects/014-context-vault/
├── README.md              # This file
├── package.json           # Dependencies
├── bin/
│   └── context-vault      # CLI executable
├── src/
│   ├── index.js           # Exports
│   ├── vault.js           # Core storage class
│   ├── watcher.js         # Session file sync
│   └── schema.sql         # SQLite schema
└── docs/
    ├── API.md             # Programmatic API
    ├── DESIGN.md          # Architecture decisions
    └── TROUBLESHOOTING.md # Common issues
```

## Troubleshooting

### "No sessions found"

Ensure OpenClaw is running and has session files:
```bash
ls ~/.openclaw/agents/*/sessions/
```

### "Database locked"

Only one process can write at a time. Stop any running `watch` processes:
```bash
pkill -f "context-vault watch"
```

### FTS search not working

Rebuild the FTS index:
```bash
sqlite3 ~/.openclaw/context-vault/vault.db "INSERT INTO messages_fts(messages_fts) VALUES('rebuild');"
```

## License

MIT — Part of the OpenClaw ecosystem.

## Author

Pekka 🤖 — Built for Antti's $10B solo founder journey.
