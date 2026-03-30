import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

// ── get_context ───────────────────────────────────────────────────────────────

test('ContextBuilder.build returns a non-empty string for a valid task', async (t) => {
  const { ContextBuilder } = await import('../../lib/context-builder.js');
  const builder = new ContextBuilder();
  const result = await builder.build('implement null safety in Kotlin');
  assert.ok(typeof result === 'string', 'result is a string');
  assert.ok(result.length > 50, 'result has meaningful content');
});

test('ContextBuilder.buildWithGraph returns skill context even with no file', async (t) => {
  const { ContextBuilder } = await import('../../lib/context-builder.js');
  const builder = new ContextBuilder();
  const result = await builder.buildWithGraph('implement null safety in Kotlin', null);
  assert.ok(typeof result === 'string', 'result is a string');
  assert.ok(result.length > 50, 'result has meaningful content');
});

// ── create_note ───────────────────────────────────────────────────────────────

test('serializeNode + saveNode creates a readable note node', async (t) => {
  const { serializeNode, saveNode, loadNode, parseNodeFrontmatter, generateNodeId } = await import('../../lib/engine/graph.js');
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'mcp-note-'));
  const id = generateNodeId('node');
  const content = serializeNode({ id, type: 'note', title: 'MCP test note', content: 'body text' });
  const filePath = saveNode(content, id, { nodesDir: tmpDir });
  const raw = loadNode(id, { nodesDir: tmpDir });
  const parsed = parseNodeFrontmatter(raw);
  assert.strictEqual(parsed.title, 'MCP test note');
  assert.ok(parsed.body.includes('body text'));
});

// ── search_knowledge ─────────────────────────────────────────────────────────

test('BookLibSearcher.search returns an array (empty or populated)', async (t) => {
  const { BookLibSearcher } = await import('../../lib/engine/searcher.js');
  const searcher = new BookLibSearcher();
  try {
    const results = await searcher.search('null safety', 3);
    assert.ok(Array.isArray(results), 'results is an array');
  } catch (err) {
    // Index not built in test env — acceptable
    assert.ok(err.message.includes('booklib index'), 'informative error message');
  }
});
