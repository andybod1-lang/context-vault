#!/usr/bin/env node

/**
 * ContextVault Tests
 * 
 * Run: npm test
 * Or: node test/test.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Test with isolated database
const TEST_DB = path.join(os.tmpdir(), `context-vault-test-${Date.now()}.db`);

// Override the default path for testing
process.env.CONTEXT_VAULT_DB = TEST_DB;

const ContextVault = require('../src/vault');

let vault;
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`❌ ${name}`);
    console.log(`   ${e.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, got ${actual}. ${msg}`);
  }
}

function assertTrue(value, msg = '') {
  if (!value) {
    throw new Error(`Expected truthy value. ${msg}`);
  }
}

// === Tests ===

console.log('\n🧪 ContextVault Tests\n');

// Setup
vault = new ContextVault(TEST_DB);

test('Create vault instance', () => {
  assertTrue(vault.db, 'Database should be initialized');
});

test('Append message', () => {
  vault.appendMessage('test:session:1', {
    role: 'user',
    content: 'Hello world'
  });
  
  const messages = vault.getMessages('test:session:1');
  assertEqual(messages.length, 1, 'Should have 1 message');
  assertEqual(messages[0].role, 'user');
  assertEqual(messages[0].content, 'Hello world');
});

test('Append multiple messages', () => {
  vault.appendMessage('test:session:1', {
    role: 'assistant',
    content: 'Hi there!'
  });
  
  vault.appendMessage('test:session:1', {
    role: 'user',
    content: 'How are you?'
  });
  
  const messages = vault.getMessages('test:session:1');
  assertEqual(messages.length, 3, 'Should have 3 messages');
});

test('Get messages with limit', () => {
  const messages = vault.getMessages('test:session:1', { limit: 2 });
  assertEqual(messages.length, 2, 'Should return only 2 messages');
});

test('Create snapshot', () => {
  vault.createSnapshot('test:session:1', 'test-snapshot', 'manual');
  
  const snapshots = vault.getSnapshots('test:session:1');
  assertEqual(snapshots.length, 1, 'Should have 1 snapshot');
  assertEqual(snapshots[0].name, 'test-snapshot');
  assertEqual(snapshots[0].trigger, 'manual');
});

test('Record compaction', () => {
  vault.recordCompaction('test:session:1', {
    messagesBefore: 100,
    messagesAfter: 20,
    summaryAvailable: false
  });
  
  const compactions = vault.getCompactions('test:session:1');
  assertEqual(compactions.length, 1, 'Should have 1 compaction');
  assertEqual(compactions[0].messages_before, 100);
  assertEqual(compactions[0].messages_after, 20);
  assertEqual(compactions[0].summary_available, 0);
});

test('Full-text search', () => {
  // Add searchable content
  vault.appendMessage('test:session:2', {
    role: 'user',
    content: 'The database migration was successful'
  });
  
  vault.appendMessage('test:session:2', {
    role: 'assistant',
    content: 'Great! The migration completed without errors.'
  });
  
  const results = vault.search('migration');
  assertTrue(results.length >= 2, 'Should find at least 2 results');
  assertTrue(results.some(r => r.content.includes('migration')));
});

test('Search with session filter', () => {
  const results = vault.search('Hello', { sessionId: 'test:session:1' });
  assertTrue(results.length >= 1, 'Should find result in session 1');
  assertEqual(results[0].session_id, 'test:session:1');
});

test('Get session stats', () => {
  const stats = vault.getSessionStats('test:session:1');
  assertEqual(stats.sessionId, 'test:session:1');
  assertTrue(stats.messageCount >= 3, 'Should have at least 3 messages');
});

test('Get vault stats', () => {
  const stats = vault.getStats();
  assertTrue(stats.sessions >= 2, 'Should have at least 2 sessions');
  assertTrue(stats.messages >= 5, 'Should have at least 5 messages');
  assertEqual(stats.snapshots, 1);
  assertEqual(stats.compactions, 1);
});

test('Generate recovery file', () => {
  const outputPath = path.join(os.tmpdir(), `recovery-test-${Date.now()}.md`);
  
  vault.generateRecoveryFile('test:session:1', {
    messageCount: 10,
    outputPath
  });
  
  assertTrue(fs.existsSync(outputPath), 'Recovery file should exist');
  
  const content = fs.readFileSync(outputPath, 'utf8');
  assertTrue(content.includes('Context Recovery File'));
  assertTrue(content.includes('test:session:1'));
  
  // Cleanup
  fs.unlinkSync(outputPath);
});

test('Message metadata', () => {
  vault.appendMessage('test:session:3', {
    role: 'user',
    content: 'Test with metadata',
    metadata: { source: 'test', priority: 'high' }
  });
  
  const messages = vault.getMessages('test:session:3');
  const metadata = JSON.parse(messages[0].metadata);
  assertEqual(metadata.source, 'test');
  assertEqual(metadata.priority, 'high');
});

test('Multiple snapshots', () => {
  vault.createSnapshot('test:session:1', 'snapshot-2', 'auto');
  vault.createSnapshot('test:session:1', 'snapshot-3', 'pre-compaction');
  
  const snapshots = vault.getSnapshots('test:session:1');
  assertEqual(snapshots.length, 3, 'Should have 3 snapshots');
});

test('Empty session', () => {
  const messages = vault.getMessages('nonexistent:session');
  assertEqual(messages.length, 0, 'Should return empty array');
  
  const stats = vault.getSessionStats('nonexistent:session');
  assertEqual(stats.messageCount, 0);
});

// Cleanup
vault.close();
fs.unlinkSync(TEST_DB);

// Try to clean up WAL files too
try {
  fs.unlinkSync(TEST_DB + '-wal');
  fs.unlinkSync(TEST_DB + '-shm');
} catch (e) {
  // Ignore if they don't exist
}

// Summary
console.log('\n' + '='.repeat(40));
console.log(`Tests: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
console.log('='.repeat(40) + '\n');

process.exit(failed > 0 ? 1 : 0);
