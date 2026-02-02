# ContextVault Troubleshooting Guide

Common issues and solutions.

## Installation Issues

### "Cannot find module 'better-sqlite3'"

**Problem:** Native module not installed.

**Solution:**
```bash
cd projects/014-context-vault
npm install
```

If that fails, rebuild native modules:
```bash
npm rebuild better-sqlite3
```

### "Node version mismatch"

**Problem:** better-sqlite3 was compiled with a different Node version.

**Solution:**
```bash
npm rebuild better-sqlite3
```

Or reinstall:
```bash
rm -rf node_modules
npm install
```

---

## Sync Issues

### "No sessions found"

**Problem:** No OpenClaw session files detected.

**Check:**
```bash
ls ~/.openclaw/agents/*/sessions/
```

**Solutions:**
1. Ensure OpenClaw is installed and has been run at least once
2. Check the path is correct (default: `~/.openclaw/`)
3. Start an OpenClaw session to create files

### "0 messages synced"

**Problem:** Sessions exist but no new messages.

**Possible causes:**
1. Already synced — run `stats` to check
2. Session files are empty
3. Messages are in unexpected format

**Debug:**
```bash
# Check a session file directly
head -20 ~/.openclaw/agents/main/sessions/*.jsonl
```

### Sync is slow

**Problem:** Initial sync takes too long.

**Solutions:**
1. Run sync once to bootstrap, then use `watch`
2. Increase watch interval: `watch --interval 30000`
3. For large histories, be patient on first sync

---

## Search Issues

### "No results found"

**Problem:** Search returns nothing even for known content.

**Check FTS index:**
```bash
sqlite3 ~/.openclaw/context-vault/vault.db "SELECT COUNT(*) FROM messages_fts;"
```

**Rebuild FTS if needed:**
```bash
sqlite3 ~/.openclaw/context-vault/vault.db "INSERT INTO messages_fts(messages_fts) VALUES('rebuild');"
```

### Search syntax errors

**Problem:** FTS5 query syntax error.

**Common issues:**
- Special characters need escaping
- Use quotes for phrases

**Examples:**
```bash
# Simple word
./bin/context-vault search "database"

# Phrase (wrap in double quotes)
./bin/context-vault search '"database migration"'

# Multiple words (AND by default)
./bin/context-vault search "database migration"

# OR search
./bin/context-vault search "database OR migration"

# Prefix match
./bin/context-vault search "data*"
```

---

## Database Issues

### "Database is locked"

**Problem:** Another process is writing to the database.

**Solutions:**
1. Stop any running `watch` processes:
   ```bash
   pkill -f "context-vault watch"
   ```
2. Check for zombie processes:
   ```bash
   lsof ~/.openclaw/context-vault/vault.db
   ```
3. Wait and retry (WAL mode handles concurrent reads)

### "Database is corrupted"

**Problem:** SQLite reports corruption.

**Solutions:**

1. **Try recovery:**
   ```bash
   cd ~/.openclaw/context-vault
   sqlite3 vault.db ".recover" | sqlite3 vault-recovered.db
   mv vault.db vault-corrupted.db
   mv vault-recovered.db vault.db
   ```

2. **Restore from backup:**
   Check Time Machine or other backups.

3. **Start fresh:**
   ```bash
   rm ~/.openclaw/context-vault/vault.db
   ./bin/context-vault sync
   ```
   This loses history but rebuilds from session files.

### Database growing too large

**Problem:** vault.db is using too much disk space.

**Check size:**
```bash
ls -lh ~/.openclaw/context-vault/vault.db
```

**Solutions:**

1. **Vacuum the database:**
   ```bash
   sqlite3 ~/.openclaw/context-vault/vault.db "VACUUM;"
   ```

2. **Future: Prune old messages** (not yet implemented)

---

## Recovery Issues

### Recovery file is empty

**Problem:** `recover` generates empty file.

**Check:**
```bash
./bin/context-vault stats
```

If messages = 0, sync first:
```bash
./bin/context-vault sync
./bin/context-vault recover
```

### Recovery doesn't restore context

**Problem:** Claude still doesn't remember after reading recovery file.

**Note:** The recovery file provides information, but Claude needs to actually read and process it. In OpenClaw:

1. Generate recovery file:
   ```bash
   ./bin/context-vault recover --output /tmp/recovery.md
   ```

2. Read it in the session:
   ```
   Read /tmp/recovery.md
   ```

3. Or include key points in HANDOFF.md

---

## Watch Mode Issues

### Watch uses too much CPU

**Problem:** `watch` daemon consuming resources.

**Solutions:**
1. Increase interval:
   ```bash
   ./bin/context-vault watch --interval 30000  # 30 seconds
   ```
2. Use cron instead:
   ```cron
   * * * * * /path/to/context-vault sync
   ```

### Watch stops unexpectedly

**Problem:** Daemon exits without error.

**Solutions:**
1. Check logs:
   ```bash
   ./bin/context-vault watch 2>&1 | tee /tmp/context-vault.log
   ```

2. Use launchd for automatic restart (see README)

3. Run in tmux/screen:
   ```bash
   tmux new -d -s context-vault './bin/context-vault watch'
   ```

---

## Snapshot Issues

### "Snapshot already exists"

**Problem:** Trying to create snapshot with duplicate name.

**Solution:** Use unique names:
```bash
./bin/context-vault snapshot "backup-$(date +%Y%m%d-%H%M%S)"
```

### Can't find old snapshot

**Problem:** Snapshot was created but not listed.

**Check:**
```bash
./bin/context-vault snapshots
```

**Check database directly:**
```bash
sqlite3 ~/.openclaw/context-vault/vault.db "SELECT * FROM snapshots;"
```

---

## Performance Tips

### Speed up searches

1. Keep searches specific:
   ```bash
   # Slower
   ./bin/context-vault search "the"
   
   # Faster
   ./bin/context-vault search "database migration strategy"
   ```

2. Limit results:
   ```bash
   ./bin/context-vault search "topic" --limit 5
   ```

3. Filter by session:
   ```bash
   ./bin/context-vault search "topic" --session "agent:main:main"
   ```

### Reduce disk usage

1. Run vacuum periodically:
   ```bash
   sqlite3 ~/.openclaw/context-vault/vault.db "VACUUM;"
   ```

2. WAL checkpoint:
   ```bash
   sqlite3 ~/.openclaw/context-vault/vault.db "PRAGMA wal_checkpoint(TRUNCATE);"
   ```

---

## Getting Help

### Debug mode

Run with more output:
```bash
DEBUG=1 ./bin/context-vault sync
```

### Check database directly

```bash
sqlite3 ~/.openclaw/context-vault/vault.db

# Useful queries:
.tables
SELECT COUNT(*) FROM messages;
SELECT COUNT(*) FROM sessions;
SELECT * FROM compactions ORDER BY timestamp DESC LIMIT 5;
```

### Report issues

Include:
1. Node version: `node --version`
2. OS: `uname -a`
3. Error message (full)
4. Steps to reproduce
