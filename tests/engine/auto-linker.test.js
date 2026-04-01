import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { serializeNode, saveNode, appendEdge, loadEdges } from '../../lib/engine/graph.js';
import { autoLink, autoLinkReverse } from '../../lib/engine/auto-linker.js';

function setup() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-autolink-'));
  const nodesDir = path.join(tmp, 'knowledge', 'nodes');
  const graphFile = path.join(tmp, 'knowledge', 'graph.jsonl');
  fs.mkdirSync(nodesDir, { recursive: true });
  fs.mkdirSync(path.dirname(graphFile), { recursive: true });
  return { tmp, nodesDir, graphFile };
}

describe('autoLink', () => {
  test('links new note to matching component', async () => {
    const { nodesDir, graphFile } = setup();

    // Create a component
    const compContent = serializeNode({ id: 'comp_auth', type: 'component', title: 'auth-service' });
    saveNode(compContent, 'comp_auth', { nodesDir });

    // Auto-link a new note that mentions auth
    const links = await autoLink({
      nodeId: 'note_jwt',
      title: 'JWT refresh token strategy for auth',
      nodesDir,
      graphFile,
    });

    assert.ok(links.length > 0, 'should create at least one link');
    assert.strictEqual(links[0].to, 'comp_auth');
    assert.strictEqual(links[0].type, 'applies-to');

    const edges = loadEdges({ graphFile });
    assert.ok(edges.length > 0, 'edge should be persisted');
  });

  test('links new note to related existing knowledge', async () => {
    const { nodesDir, graphFile } = setup();

    // Create existing note about JWT
    const existingContent = serializeNode({ id: 'note_existing', type: 'insight', title: 'JWT token expiry strategy' });
    saveNode(existingContent, 'note_existing', { nodesDir });

    // Auto-link a new note about JWT
    const links = await autoLink({
      nodeId: 'note_new',
      title: 'JWT refresh token rotation',
      nodesDir,
      graphFile,
    });

    const seeAlso = links.filter(l => l.type === 'see-also');
    assert.ok(seeAlso.length > 0, 'should find related knowledge');
    assert.strictEqual(seeAlso[0].to, 'note_existing');
  });

  test('does not create duplicate edges', async () => {
    const { nodesDir, graphFile } = setup();

    const compContent = serializeNode({ id: 'comp_orders', type: 'component', title: 'order-service' });
    saveNode(compContent, 'comp_orders', { nodesDir });

    // Pre-create the edge
    appendEdge({ from: 'note_es', to: 'comp_orders', type: 'applies-to', weight: 1.0, created: '2026-04-01' }, { graphFile });

    const links = await autoLink({
      nodeId: 'note_es',
      title: 'Event sourcing for orders',
      nodesDir,
      graphFile,
    });

    assert.strictEqual(links.length, 0, 'should not duplicate existing edge');
  });

  test('caps auto-links at 3', async () => {
    const { nodesDir, graphFile } = setup();

    // Create 5 notes with overlapping titles
    for (let i = 0; i < 5; i++) {
      const content = serializeNode({ id: `note_${i}`, type: 'insight', title: `testing pattern number ${i}` });
      saveNode(content, `note_${i}`, { nodesDir });
    }

    const links = await autoLink({
      nodeId: 'note_new',
      title: 'testing patterns overview',
      nodesDir,
      graphFile,
    });

    assert.ok(links.length <= 3, 'should cap at 3 auto-links');
  });

  test('returns empty when no matches', async () => {
    const { nodesDir, graphFile } = setup();

    const links = await autoLink({
      nodeId: 'note_solo',
      title: 'completely unique topic',
      nodesDir,
      graphFile,
    });

    assert.strictEqual(links.length, 0);
  });
});

describe('autoLinkReverse', () => {
  test('links existing notes to new component', async () => {
    const { nodesDir, graphFile } = setup();

    // Create existing note mentioning orders
    const noteContent = serializeNode({ id: 'note_es', type: 'decision', title: 'Use event sourcing for orders' });
    saveNode(noteContent, 'note_es', { nodesDir });

    // Create new component
    const links = await autoLinkReverse({
      componentId: 'comp_orders',
      componentTitle: 'order-service',
      nodesDir,
      graphFile,
    });

    assert.ok(links.length > 0, 'should retroactively link');
    assert.strictEqual(links[0].from, 'note_es');
    assert.strictEqual(links[0].to, 'comp_orders');
  });
});
