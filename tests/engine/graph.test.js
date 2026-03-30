import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveKnowledgePaths,
  generateNodeId,
  serializeNode,
  saveNode,
  loadNode,
  parseNodeFrontmatter,
  listNodes,
} from '../../lib/engine/graph.js';

function tmpDir() {
  return mkdtempSync(join(tmpdir(), 'booklib-graph-test-'));
}

test('generateNodeId returns prefixed hex string', () => {
  const id = generateNodeId('node');
  assert.match(id, /^node_[a-f0-9]{8}$/);
});

test('generateNodeId with component prefix', () => {
  const id = generateNodeId('comp');
  assert.match(id, /^comp_[a-f0-9]{8}$/);
});

test('serializeNode produces valid frontmatter markdown', () => {
  const md = serializeNode({
    id: 'node_abc',
    type: 'research',
    title: 'JWT patterns',
    content: 'Some findings.',
    tags: ['auth', 'jwt'],
    sources: ['https://example.com'],
    confidence: 'high',
  });
  assert.ok(md.startsWith('---\n'));
  assert.ok(md.includes('node_abc'));
  assert.ok(md.includes('research'));
  assert.ok(md.includes('JWT patterns'));
  assert.ok(md.includes('Some findings.'));
});

test('saveNode writes file and loadNode reads it back', () => {
  const dir = tmpDir();
  const nodesDir = join(dir, 'nodes');
  const id = 'node_test01';
  const content = serializeNode({ id, type: 'note', title: 'Test', content: 'hello' });
  const filePath = saveNode(content, id, { nodesDir });
  assert.ok(existsSync(filePath));
  const loaded = loadNode(id, { nodesDir });
  assert.equal(loaded, content);
  rmSync(dir, { recursive: true });
});

test('loadNode returns null for missing node', () => {
  const dir = tmpDir();
  const result = loadNode('nonexistent', { nodesDir: join(dir, 'nodes') });
  assert.equal(result, null);
  rmSync(dir, { recursive: true });
});

test('parseNodeFrontmatter extracts fields and body', () => {
  const md = `---\nid: node_x\ntype: research\ntitle: JWT\ntags:\n  - auth\n---\n\nContent here.`;
  const parsed = parseNodeFrontmatter(md);
  assert.equal(parsed.id, 'node_x');
  assert.equal(parsed.type, 'research');
  assert.equal(parsed.title, 'JWT');
  assert.deepEqual(parsed.tags, ['auth']);
  assert.equal(parsed.body, 'Content here.');
});

test('listNodes returns all node IDs', () => {
  const dir = tmpDir();
  const nodesDir = join(dir, 'nodes');
  saveNode(serializeNode({ id: 'node_a1b2c3d4', type: 'note', title: 'A', content: '' }), 'node_a1b2c3d4', { nodesDir });
  saveNode(serializeNode({ id: 'node_b2c3d4e5', type: 'note', title: 'B', content: '' }), 'node_b2c3d4e5', { nodesDir });
  const ids = listNodes({ nodesDir });
  assert.ok(ids.includes('node_a1b2c3d4'));
  assert.ok(ids.includes('node_b2c3d4e5'));
  rmSync(dir, { recursive: true });
});
