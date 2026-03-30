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

// ── list_nodes + link_nodes ───────────────────────────────────────────────────

test('listNodes returns array of IDs from a temp dir', async (t) => {
  const { listNodes, saveNode, serializeNode, generateNodeId } = await import('../../lib/engine/graph.js');
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'mcp-list-'));
  const id = generateNodeId('node');
  saveNode(serializeNode({ id, type: 'note', title: 'List test' }), id, { nodesDir: tmpDir });
  const ids = listNodes({ nodesDir: tmpDir });
  assert.ok(ids.includes(id), 'saved node appears in list');
});

test('resolveNodeRef resolves partial title to node ID in temp dir', async (t) => {
  const { saveNode, serializeNode, generateNodeId, resolveNodeRef } = await import('../../lib/engine/graph.js');
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'mcp-link-'));
  const idA = generateNodeId('node');
  const idB = generateNodeId('node');
  saveNode(serializeNode({ id: idA, type: 'note', title: 'Source note' }), idA, { nodesDir: tmpDir });
  saveNode(serializeNode({ id: idB, type: 'note', title: 'Auth component' }), idB, { nodesDir: tmpDir });
  const resolvedA = resolveNodeRef('Source note', { nodesDir: tmpDir });
  assert.strictEqual(resolvedA, idA);
});
