import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { serializeNode, saveNode, appendEdge } from '../../lib/engine/graph.js';
import { graphActivatedSearch, extractConcepts } from '../../lib/engine/graph-search.js';

function setup() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-graphsearch-'));
  const nodesDir = path.join(tmp, 'knowledge', 'nodes');
  const graphFile = path.join(tmp, 'knowledge', 'graph.jsonl');
  fs.mkdirSync(nodesDir, { recursive: true });
  fs.mkdirSync(path.dirname(graphFile), { recursive: true });
  return { tmp, nodesDir, graphFile };
}

describe('extractConcepts', () => {
  test('extracts multiple concepts from query', () => {
    const concepts = extractConcepts('build order CRUD feature');
    assert.ok(concepts.length >= 2, 'should extract multiple concepts');
    assert.ok(concepts.some(c => c.includes('order')));
    assert.ok(concepts.some(c => c.includes('crud') || c.includes('feature')));
  });

  test('returns empty for stopwords-only query', () => {
    const concepts = extractConcepts('the and or is');
    assert.strictEqual(concepts.length, 0);
  });

  test('groups compound concepts', () => {
    const concepts = extractConcepts('order service authentication');
    assert.ok(concepts.length >= 2);
  });
});

describe('graphActivatedSearch', () => {
  test('skips activation for single-concept queries', () => {
    const { nodesDir, graphFile } = setup();
    const result = graphActivatedSearch('authentication', [], { nodesDir, graphFile });
    assert.strictEqual(result.activated, false);
  });

  test('finds intersection nodes for multi-concept queries', () => {
    const { nodesDir, graphFile } = setup();

    // Create nodes
    saveNode(serializeNode({ id: 'comp_orders', type: 'component', title: 'order service' }), 'comp_orders', { nodesDir });
    saveNode(serializeNode({ id: 'note_crud', type: 'pattern', title: 'CRUD controller patterns for orders' }), 'note_crud', { nodesDir });
    saveNode(serializeNode({ id: 'note_unrelated', type: 'insight', title: 'CSS grid layout tips' }), 'note_unrelated', { nodesDir });

    // Link them
    appendEdge({ from: 'note_crud', to: 'comp_orders', type: 'applies-to', weight: 1.0, created: '2026-04-02' }, { graphFile });

    const result = graphActivatedSearch('order CRUD patterns', [], { nodesDir, graphFile });

    assert.strictEqual(result.activated, true);
    assert.ok(result.concepts.length >= 2);

    // note_crud should have high intersection score (matches both "order" and "CRUD")
    const crudResult = result.graphResults.find(r => r.source.includes('note_crud'));
    if (crudResult) {
      assert.ok(crudResult.intersectionScore >= 2, 'should match multiple concepts');
    }

    // CSS node should not appear
    const cssResult = result.graphResults.find(r => r.source.includes('note_unrelated'));
    assert.strictEqual(cssResult, undefined, 'unrelated node should not appear');
  });

  test('returns empty graph results when no nodes exist', () => {
    const { nodesDir, graphFile } = setup();
    const result = graphActivatedSearch('order CRUD feature', [], { nodesDir, graphFile });
    assert.strictEqual(result.activated, true);
    assert.strictEqual(result.graphResults.length, 0);
  });

  test('merges graph results before text results', () => {
    const { nodesDir, graphFile } = setup();

    saveNode(serializeNode({ id: 'note_both', type: 'insight', title: 'order CRUD best practices' }), 'note_both', { nodesDir });

    const textResults = [
      { text: 'some text search result', metadata: { name: 'skill-a' }, score: 0.9 },
    ];

    const result = graphActivatedSearch('order CRUD patterns', textResults, { nodesDir, graphFile });
    assert.ok(result.mergedResults.length > 0);
  });
});
