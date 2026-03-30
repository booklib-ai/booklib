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
  appendEdge,
  loadEdges,
  traverseEdges,
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

test('appendEdge writes edge to graph.jsonl', () => {
  const dir = tmpDir();
  const graphFile = join(dir, 'graph.jsonl');
  const edge = { from: 'node_a', to: 'node_b', type: 'implements', weight: 1.0 };
  appendEdge(edge, { graphFile });
  const lines = readFileSync(graphFile, 'utf8').trim().split('\n');
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), edge);
  rmSync(dir, { recursive: true });
});

test('loadEdges returns all edges from graph.jsonl', () => {
  const dir = tmpDir();
  const graphFile = join(dir, 'graph.jsonl');
  appendEdge({ from: 'a', to: 'b', type: 'see-also', weight: 1.0 }, { graphFile });
  appendEdge({ from: 'b', to: 'c', type: 'extends', weight: 0.8 }, { graphFile });
  const edges = loadEdges({ graphFile });
  assert.equal(edges.length, 2);
  assert.equal(edges[0].from, 'a');
  assert.equal(edges[1].from, 'b');
  rmSync(dir, { recursive: true });
});

test('loadEdges returns empty array when file missing', () => {
  const dir = tmpDir();
  const edges = loadEdges({ graphFile: join(dir, 'missing.jsonl') });
  assert.deepEqual(edges, []);
  rmSync(dir, { recursive: true });
});

test('traverseEdges finds 1-hop neighbours', () => {
  const edges = [
    { from: 'a', to: 'b', type: 'implements', weight: 1.0 },
    { from: 'a', to: 'c', type: 'see-also', weight: 0.9 },
    { from: 'd', to: 'e', type: 'extends', weight: 0.8 },
  ];
  const result = traverseEdges('a', edges, 1);
  const ids = result.map(r => r.id);
  assert.ok(ids.includes('b'));
  assert.ok(ids.includes('c'));
  assert.ok(!ids.includes('d'));
});

test('traverseEdges does not revisit nodes (no infinite cycles)', () => {
  const edges = [
    { from: 'a', to: 'b', type: 'see-also', weight: 1.0 },
    { from: 'b', to: 'a', type: 'see-also', weight: 1.0 },
  ];
  const result = traverseEdges('a', edges, 3);
  const ids = result.map(r => r.id);
  assert.ok(!ids.includes('a'));
});

test('traverseEdges follows edges in both directions', () => {
  const edges = [
    { from: 'x', to: 'target', type: 'applies-to', weight: 1.0 },
  ];
  const result = traverseEdges('target', edges, 1);
  const ids = result.map(r => r.id);
  assert.ok(ids.includes('x'));
});

test('serializeNode preserves body content passed via stdin path', async (t) => {
  const result = serializeNode({ id: 'node_test01', type: 'note', title: 'My note', content: 'body text here' });
  assert.ok(result.includes('body text here'), 'body text is in the serialized node');
  assert.ok(result.includes('title: My note'), 'title is in frontmatter');
});
