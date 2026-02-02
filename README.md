# ContextVault

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?logo=buymeacoffee)](https://buymeacoffee.com/PekkaPrime)

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
- 🔧 **Recovery** — Rebuild context after compaction in seconds
- 📊 **Stats** — See message counts, date ranges, session info
- 🖥️ **Daemon mode** — Run as background service via launchd

## Installation

```bash
# Clone
git clone https://github.com/andybod1-lang/context-vault.git
cd context-vault

# Install dependencies
npm install

# Run once (syncs all existing sessions)
./bin/context-vault sync

# Or start daemon for continuous sync
./bin/context-vault daemon
```

## Usage

```bash
# Search all conversations
./bin/context-vault search "topic"

# Recover context after compaction
./bin/context-vault recover --last 50

# View stats
./bin/context-vault stats

# Create named snapshot
./bin/context-vault snapshot "before-migration"

# List snapshots
./bin/context-vault snapshots
```

## Daemon Setup (macOS)

```bash
# Install launchd plist
cp com.openclaw.contextvault.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.openclaw.contextvault.plist

# Check status
launchctl list | grep contextvault
```

## Database Location

`~/.openclaw/context-vault/vault.db`

## Cost

**$0/month** — Pure Node.js + SQLite. No API calls, no cloud services.

## License

MIT
