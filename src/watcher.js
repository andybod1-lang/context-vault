const fs = require('fs');
const path = require('path');
const ContextVault = require('./vault');

const OPENCLAW_DIR = path.join(process.env.HOME, '.openclaw');

class SessionWatcher {
  constructor(vault = null) {
    this.vault = vault || new ContextVault();
    this.openclawDir = OPENCLAW_DIR;
    this.lastSync = {}; // sessionId -> { messageCount, timestamp }
  }

  getSessionFiles() {
    const files = [];
    const agentsDir = path.join(this.openclawDir, 'agents');
    
    if (!fs.existsSync(agentsDir)) {
      return files;
    }
    
    // Scan all agents' session directories
    for (const agent of fs.readdirSync(agentsDir)) {
      const sessionsDir = path.join(agentsDir, agent, 'sessions');
      if (fs.existsSync(sessionsDir)) {
        for (const file of fs.readdirSync(sessionsDir)) {
          if (file.endsWith('.jsonl')) {
            files.push(path.join(sessionsDir, file));
          }
        }
      }
    }
    
    return files;
  }

  parseSessionFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n').filter(l => l);
    
    let session = null;
    const messages = [];
    
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        
        // Session metadata
        if (obj.type === 'session') {
          session = { sessionKey: `session:${obj.id}`, id: obj.id, timestamp: obj.timestamp };
        }
        
        // Message entries
        if (obj.type === 'message' && obj.message) {
          const msg = obj.message;
          // Extract text content
          let textContent = '';
          if (Array.isArray(msg.content)) {
            textContent = msg.content
              .filter(c => c.type === 'text')
              .map(c => c.text)
              .join('\n');
          } else if (typeof msg.content === 'string') {
            textContent = msg.content;
          }
          
          if (textContent && (msg.role === 'user' || msg.role === 'assistant')) {
            messages.push({
              role: msg.role,
              content: textContent,
              timestamp: msg.timestamp || obj.timestamp
            });
          }
        }
      } catch (e) {
        // Skip malformed lines
      }
    }
    
    return { session, messages };
  }

  syncSession(filePath) {
    const { session, messages } = this.parseSessionFile(filePath);
    if (!session?.sessionKey) return { synced: 0, compaction: false };
    
    const sessionId = session.sessionKey;
    const lastInfo = this.lastSync[sessionId] || { messageCount: 0 };
    
    // Detect compaction (message count dropped significantly)
    if (lastInfo.messageCount > 0 && messages.length < lastInfo.messageCount - 5) {
      this.vault.recordCompaction(sessionId, {
        messagesBefore: lastInfo.messageCount,
        messagesAfter: messages.length,
        summaryAvailable: true // We don't know, assume yes
      });
      console.log(`⚠️  Compaction detected: ${sessionId} (${lastInfo.messageCount} → ${messages.length})`);
    }
    
    // Sync new messages
    const existingCount = this.vault.getSessionStats(sessionId).messageCount;
    let synced = 0;
    
    for (let i = existingCount; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.content) {
        // Extract content from message structure
        let content = '';
        if (Array.isArray(msg.content)) {
          content = msg.content
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join('\n');
        } else if (typeof msg.content === 'string') {
          content = msg.content;
        }
        
        if (content) {
          this.vault.appendMessage(sessionId, {
            role: msg.role,
            content: content,
            metadata: { timestamp: msg.timestamp }
          });
          synced++;
        }
      }
    }
    
    // Update tracking
    this.lastSync[sessionId] = {
      messageCount: messages.length,
      timestamp: Date.now()
    };
    
    return { synced, sessionId, total: messages.length };
  }

  syncAll() {
    const files = this.getSessionFiles();
    let totalSynced = 0;
    let sessionsUpdated = 0;
    
    for (const file of files) {
      try {
        const result = this.syncSession(file);
        if (result.synced > 0) {
          totalSynced += result.synced;
          sessionsUpdated++;
          console.log(`  ${result.sessionId}: +${result.synced} messages`);
        }
      } catch (e) {
        console.error(`  Error syncing ${path.basename(file)}: ${e.message}`);
      }
    }
    
    return { totalSynced, sessionsUpdated, filesScanned: files.length };
  }

  watch(intervalMs = 5000) {
    console.log(`👀 Watching ${this.openclawDir}/agents/*/sessions/`);
    console.log(`   Interval: ${intervalMs}ms\n`);
    
    // Initial sync
    const initial = this.syncAll();
    console.log(`\n✅ Initial sync: ${initial.totalSynced} messages from ${initial.filesScanned} files\n`);
    
    // Watch loop
    setInterval(() => {
      const result = this.syncAll();
      if (result.totalSynced > 0) {
        console.log(`\n✅ Synced ${result.totalSynced} new messages`);
      }
    }, intervalMs);
  }
}

module.exports = SessionWatcher;
