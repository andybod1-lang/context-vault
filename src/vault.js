const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DEFAULT_DB_PATH = process.env.CONTEXT_VAULT_DB || 
  path.join(process.env.HOME, '.openclaw', 'context-vault', 'vault.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

class ContextVault {
  constructor(dbPath = DEFAULT_DB_PATH) {
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  initSchema() {
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    this.db.exec(schema);
  }

  // === Write Operations ===

  ensureSession(sessionId, agentId = null) {
    const existing = this.db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
    if (!existing) {
      this.db.prepare(`
        INSERT INTO sessions (id, agent_id, created_at, last_activity)
        VALUES (?, ?, ?, ?)
      `).run(sessionId, agentId, Date.now(), Date.now());
    }
  }

  appendMessage(sessionId, { role, content, metadata = null }) {
    this.ensureSession(sessionId);
    
    const lastIndex = this.db.prepare(
      'SELECT MAX(message_index) as idx FROM messages WHERE session_id = ?'
    ).get(sessionId);
    
    const newIndex = (lastIndex?.idx ?? -1) + 1;
    
    this.db.prepare(`
      INSERT INTO messages (session_id, message_index, role, content, timestamp, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sessionId, newIndex, role, content, Date.now(), JSON.stringify(metadata));
    
    // Update session
    this.db.prepare(`
      UPDATE sessions SET last_activity = ?, total_messages = total_messages + 1
      WHERE id = ?
    `).run(Date.now(), sessionId);
  }

  createSnapshot(sessionId, name, trigger = 'manual') {
    this.ensureSession(sessionId);
    
    const stats = this.getSessionStats(sessionId);
    const lastMsg = this.db.prepare(
      'SELECT id FROM messages WHERE session_id = ? ORDER BY id DESC LIMIT 1'
    ).get(sessionId);
    
    this.db.prepare(`
      INSERT INTO snapshots (session_id, name, trigger, message_count, created_at, last_message_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sessionId, name, trigger, stats.messageCount, Date.now(), lastMsg?.id);
  }

  recordCompaction(sessionId, { messagesBefore, messagesAfter, summaryAvailable }) {
    this.ensureSession(sessionId);
    
    this.db.prepare(`
      INSERT INTO compactions (session_id, timestamp, messages_before, messages_after, summary_available)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, Date.now(), messagesBefore, messagesAfter, summaryAvailable ? 1 : 0);
  }

  // === Read Operations ===

  getMessages(sessionId, { limit = 50, offset = 0 } = {}) {
    return this.db.prepare(`
      SELECT * FROM messages 
      WHERE session_id = ? 
      ORDER BY timestamp DESC 
      LIMIT ? OFFSET ?
    `).all(sessionId, limit, offset);
  }

  search(query, { sessionId = null, limit = 20 } = {}) {
    let sql = `
      SELECT m.*, highlight(messages_fts, 0, '**', '**') as highlighted
      FROM messages_fts
      JOIN messages m ON messages_fts.rowid = m.id
      WHERE messages_fts MATCH ?
    `;
    const params = [query];
    
    if (sessionId) {
      sql += ' AND m.session_id = ?';
      params.push(sessionId);
    }
    
    sql += ' ORDER BY rank LIMIT ?';
    params.push(limit);
    
    return this.db.prepare(sql).all(...params);
  }

  getSnapshots(sessionId) {
    return this.db.prepare(
      'SELECT * FROM snapshots WHERE session_id = ? ORDER BY created_at DESC'
    ).all(sessionId);
  }

  getCompactions(sessionId) {
    return this.db.prepare(
      'SELECT * FROM compactions WHERE session_id = ? ORDER BY timestamp DESC'
    ).all(sessionId);
  }

  getSessionStats(sessionId) {
    const session = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
    const messageCount = this.db.prepare(
      'SELECT COUNT(*) as count FROM messages WHERE session_id = ?'
    ).get(sessionId)?.count || 0;
    
    return {
      sessionId,
      messageCount,
      lastActivity: session?.last_activity,
      createdAt: session?.created_at
    };
  }

  getStats() {
    const sessions = this.db.prepare('SELECT COUNT(*) as count FROM sessions').get().count;
    const messages = this.db.prepare('SELECT COUNT(*) as count FROM messages').get().count;
    const snapshots = this.db.prepare('SELECT COUNT(*) as count FROM snapshots').get().count;
    const compactions = this.db.prepare('SELECT COUNT(*) as count FROM compactions').get().count;
    
    return { sessions, messages, snapshots, compactions };
  }

  // === Recovery ===

  generateRecoveryFile(sessionId, { messageCount = 50, outputPath = null } = {}) {
    const messages = this.getMessages(sessionId, { limit: messageCount });
    const lastCompaction = this.db.prepare(
      'SELECT * FROM compactions WHERE session_id = ? ORDER BY timestamp DESC LIMIT 1'
    ).get(sessionId);
    
    let content = `# Context Recovery File\n\n`;
    content += `**Session:** ${sessionId}\n`;
    content += `**Generated:** ${new Date().toISOString()}\n`;
    content += `**Messages:** Last ${messages.length}\n\n`;
    
    if (lastCompaction) {
      content += `## Last Compaction\n`;
      content += `- Time: ${new Date(lastCompaction.timestamp).toISOString()}\n`;
      content += `- Messages before: ${lastCompaction.messages_before}\n`;
      content += `- Summary available: ${lastCompaction.summary_available ? 'yes' : 'no'}\n\n`;
    }
    
    content += `## Recent Conversation\n\n`;
    
    for (const msg of messages.reverse()) {
      const role = msg.role.toUpperCase();
      const time = new Date(msg.timestamp).toISOString().slice(11, 19);
      content += `### [${time}] ${role}\n\n`;
      content += `${msg.content?.slice(0, 2000) || '(no content)'}\n\n`;
      content += `---\n\n`;
    }
    
    if (outputPath) {
      fs.writeFileSync(outputPath, content);
    }
    
    return content;
  }

  close() {
    this.db.close();
  }
}

module.exports = ContextVault;
