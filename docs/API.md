# ContextVault API Reference

Programmatic API for integrating ContextVault into your applications.

## Installation

```javascript
const { ContextVault, SessionWatcher } = require('./src');
```

## ContextVault Class

Core storage and query layer.

### Constructor

```javascript
const vault = new ContextVault(dbPath);
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `dbPath` | string | `~/.openclaw/context-vault/vault.db` | Path to SQLite database |

### Methods

#### appendMessage(sessionId, message)

Store a new message.

```javascript
vault.appendMessage('agent:main:main', {
  role: 'user',           // 'user' | 'assistant' | 'system'
  content: 'Hello world',
  metadata: { source: 'telegram' }  // optional
});
```

#### getMessages(sessionId, options)

Retrieve messages from a session.

```javascript
const messages = vault.getMessages('agent:main:main', {
  limit: 50,    // default: 50
  offset: 0     // for pagination
});

// Returns:
// [
//   { id, session_id, role, content, timestamp, metadata },
//   ...
// ]
```

#### search(query, options)

Full-text search across all messages.

```javascript
const results = vault.search('database migration', {
  sessionId: null,  // optional: limit to session
  limit: 20         // default: 20
});

// Returns:
// [
//   { id, session_id, role, content, timestamp, highlighted },
//   ...
// ]
```

The `highlighted` field contains the content with search matches wrapped in `**`.

#### createSnapshot(sessionId, name, trigger)

Create a named checkpoint.

```javascript
vault.createSnapshot('agent:main:main', 'before-migration', 'manual');
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sessionId` | string | required | Session identifier |
| `name` | string | required | Snapshot name |
| `trigger` | string | `'manual'` | `'manual'`, `'auto'`, `'pre-compaction'` |

#### getSnapshots(sessionId)

List all snapshots for a session.

```javascript
const snapshots = vault.getSnapshots('agent:main:main');

// Returns:
// [
//   { id, session_id, name, trigger, message_count, created_at, last_message_id },
//   ...
// ]
```

#### recordCompaction(sessionId, data)

Record a compaction event.

```javascript
vault.recordCompaction('agent:main:main', {
  messagesBefore: 150,
  messagesAfter: 30,
  summaryAvailable: false
});
```

#### getCompactions(sessionId)

List compaction events.

```javascript
const compactions = vault.getCompactions('agent:main:main');
```

#### generateRecoveryFile(sessionId, options)

Generate a markdown file for context recovery.

```javascript
const content = vault.generateRecoveryFile('agent:main:main', {
  messageCount: 50,
  outputPath: '/tmp/recovery.md'  // optional: also writes to file
});

// Returns markdown string
```

#### getStats()

Get vault statistics.

```javascript
const stats = vault.getStats();

// Returns:
// {
//   sessions: 1163,
//   messages: 15315,
//   snapshots: 3,
//   compactions: 4
// }
```

#### getSessionStats(sessionId)

Get statistics for a specific session.

```javascript
const stats = vault.getSessionStats('agent:main:main');

// Returns:
// {
//   sessionId: 'agent:main:main',
//   messageCount: 500,
//   lastActivity: 1706875200000,
//   createdAt: 1706788800000
// }
```

#### close()

Close the database connection.

```javascript
vault.close();
```

## SessionWatcher Class

Monitors OpenClaw session files and syncs to vault.

### Constructor

```javascript
const watcher = new SessionWatcher(vault);
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `vault` | ContextVault | new ContextVault() | Vault instance to sync to |

### Methods

#### syncAll()

Sync all session files to vault.

```javascript
const result = watcher.syncAll();

// Returns:
// {
//   totalSynced: 150,
//   sessionsUpdated: 5,
//   filesScanned: 1163
// }
```

#### syncSession(filePath)

Sync a single session file.

```javascript
const result = watcher.syncSession('/path/to/session.jsonl');

// Returns:
// {
//   synced: 10,
//   sessionId: 'session:abc123',
//   total: 150
// }
```

#### watch(intervalMs)

Start continuous sync loop.

```javascript
watcher.watch(5000);  // Sync every 5 seconds
```

This runs indefinitely until the process is killed.

#### getSessionFiles()

Get list of all session files.

```javascript
const files = watcher.getSessionFiles();
// ['/home/user/.openclaw/agents/main/sessions/abc.jsonl', ...]
```

## Usage Examples

### Basic Usage

```javascript
const { ContextVault, SessionWatcher } = require('./src');

// Create vault
const vault = new ContextVault();

// Sync sessions
const watcher = new SessionWatcher(vault);
watcher.syncAll();

// Search for something
const results = vault.search('deployment strategy');
console.log(results);

// Get recent messages
const messages = vault.getMessages('agent:main:main', { limit: 10 });
console.log(messages);

// Clean up
vault.close();
```

### Recovery After Compaction

```javascript
const { ContextVault } = require('./src');

const vault = new ContextVault();

// Generate recovery file
const recoveryContent = vault.generateRecoveryFile('agent:main:main', {
  messageCount: 50,
  outputPath: '/tmp/recovery.md'
});

console.log('Recovery file generated');
console.log(recoveryContent);
```

### Automated Snapshots

```javascript
const { ContextVault } = require('./src');

const vault = new ContextVault();
const sessionId = 'agent:main:main';

// Check message count
const stats = vault.getSessionStats(sessionId);

// Create snapshot if significant messages
if (stats.messageCount > 100) {
  const name = `auto-${new Date().toISOString().slice(0, 16).replace(/[:-]/g, '')}`;
  vault.createSnapshot(sessionId, name, 'auto');
  console.log(`Created snapshot: ${name}`);
}
```

### Compaction Detection

```javascript
const { ContextVault, SessionWatcher } = require('./src');

const vault = new ContextVault();
const watcher = new SessionWatcher(vault);

// After sync, check for compactions
watcher.syncAll();

const compactions = vault.getCompactions('agent:main:main');
const lastCompaction = compactions[0];

if (lastCompaction && !lastCompaction.summary_available) {
  console.log('⚠️ Last compaction had no summary!');
  console.log(`Messages lost: ${lastCompaction.messages_before - lastCompaction.messages_after}`);
  
  // Generate recovery
  vault.generateRecoveryFile('agent:main:main', {
    messageCount: 100,
    outputPath: '/tmp/emergency-recovery.md'
  });
}
```

### Search with Highlighting

```javascript
const { ContextVault } = require('./src');

const vault = new ContextVault();

const results = vault.search('bug fix', { limit: 5 });

for (const r of results) {
  console.log(`[${new Date(r.timestamp).toISOString()}] ${r.role}`);
  console.log(`  ${r.highlighted.slice(0, 200)}...`);
  console.log();
}
```

## Error Handling

```javascript
const { ContextVault } = require('./src');

try {
  const vault = new ContextVault();
  
  // Operations...
  
} catch (error) {
  if (error.code === 'SQLITE_BUSY') {
    console.error('Database is locked. Another process may be using it.');
  } else if (error.code === 'SQLITE_CORRUPT') {
    console.error('Database is corrupted. Restore from backup.');
  } else {
    throw error;
  }
}
```

## TypeScript Types (for reference)

```typescript
interface Message {
  id: number;
  session_id: string;
  message_index: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata: string | null;
}

interface Snapshot {
  id: number;
  session_id: string;
  name: string;
  trigger: 'manual' | 'auto' | 'pre-compaction';
  message_count: number;
  created_at: number;
  last_message_id: number | null;
}

interface Compaction {
  id: number;
  session_id: string;
  timestamp: number;
  messages_before: number;
  messages_after: number;
  summary_available: 0 | 1;
}

interface VaultStats {
  sessions: number;
  messages: number;
  snapshots: number;
  compactions: number;
}

interface SessionStats {
  sessionId: string;
  messageCount: number;
  lastActivity: number | null;
  createdAt: number | null;
}

interface SyncResult {
  totalSynced: number;
  sessionsUpdated: number;
  filesScanned: number;
}
```
