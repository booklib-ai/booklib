// tests/engine/sibling-expansion.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { expandSiblings } from '../../lib/engine/searcher.js';

function makeChunk(parentId, siblingIndex, siblingCount, source, score = 1) {
  return {
    text: `chunk ${parentId}:${siblingIndex}`,
    score,
    metadata: { parentId, siblingIndex, siblingCount, name: source },
  };
}

describe('expandSiblings', () => {
  it('expands when >=50% siblings match', () => {
    // 2 of 4 siblings from parent p1 are in results (50% threshold met)
    const results = [
      makeChunk('p1', 0, 4, 'skill-a', 0.9),
      makeChunk('p1', 1, 4, 'skill-a', 0.8),
      makeChunk('p2', 0, 2, 'skill-b', 0.7),
    ];

    // allChunks has all 4 siblings of p1 plus the p2 chunk
    const allChunks = [
      makeChunk('p1', 0, 4, 'skill-a'),
      makeChunk('p1', 1, 4, 'skill-a'),
      makeChunk('p1', 2, 4, 'skill-a'),
      makeChunk('p1', 3, 4, 'skill-a'),
      makeChunk('p2', 0, 2, 'skill-b'),
    ];

    const expanded = expandSiblings(results, allChunks);

    // Should contain all 4 p1 chunks + the p2 chunk = 5 total
    const p1Chunks = expanded.filter(r => r.metadata.parentId === 'p1');
    assert.equal(p1Chunks.length, 4, 'all 4 p1 siblings should be present');

    // Expanded siblings should be sorted by siblingIndex
    const p1Indexes = p1Chunks.map(r => r.metadata.siblingIndex);
    // The original 0,1 come first, then expanded 2,3 are inserted after the first p1 chunk
    assert.ok(p1Indexes.includes(2), 'sibling 2 should be expanded');
    assert.ok(p1Indexes.includes(3), 'sibling 3 should be expanded');

    // p2 chunk should still be present
    const p2Chunks = expanded.filter(r => r.metadata.parentId === 'p2');
    assert.equal(p2Chunks.length, 1, 'unrelated p2 chunk preserved');
  });

  it('does NOT expand when <50% siblings match', () => {
    // 1 of 4 siblings from parent p1 (25%, below threshold)
    const results = [
      makeChunk('p1', 0, 4, 'skill-a', 0.9),
      makeChunk('p2', 0, 2, 'skill-b', 0.7),
    ];

    const allChunks = [
      makeChunk('p1', 0, 4, 'skill-a'),
      makeChunk('p1', 1, 4, 'skill-a'),
      makeChunk('p1', 2, 4, 'skill-a'),
      makeChunk('p1', 3, 4, 'skill-a'),
      makeChunk('p2', 0, 2, 'skill-b'),
    ];

    const expanded = expandSiblings(results, allChunks);

    // Should remain unchanged — no expansion
    assert.equal(expanded.length, 2, 'no expansion when below threshold');
    const p1Chunks = expanded.filter(r => r.metadata.parentId === 'p1');
    assert.equal(p1Chunks.length, 1, 'only the original p1 chunk remains');
  });

  it('preserves source diversity after expansion', () => {
    // p1 from skill-a gets expanded, but skill-b results must survive
    const results = [
      makeChunk('p1', 0, 2, 'skill-a', 0.9),
      makeChunk('p1', 1, 2, 'skill-a', 0.85),
      makeChunk('p3', 0, 1, 'skill-c', 0.6),
    ];

    const allChunks = [
      makeChunk('p1', 0, 2, 'skill-a'),
      makeChunk('p1', 1, 2, 'skill-a'),
      makeChunk('p3', 0, 1, 'skill-c'),
    ];

    const expanded = expandSiblings(results, allChunks);

    // All p1 siblings already present (2/2), expansion is a no-op for missing
    // skill-c chunk must still be present
    const sources = new Set(expanded.map(r => r.metadata.name));
    assert.ok(sources.has('skill-a'), 'skill-a results preserved');
    assert.ok(sources.has('skill-c'), 'skill-c results preserved (source diversity)');
    assert.equal(expanded.length, 3, 'no duplicates introduced');
  });

  it('handles results without parentId gracefully', () => {
    const results = [
      { text: 'no parent', score: 0.9, metadata: { name: 'skill-x' } },
      makeChunk('p1', 0, 2, 'skill-a', 0.8),
      makeChunk('p1', 1, 2, 'skill-a', 0.7),
    ];

    const allChunks = [
      makeChunk('p1', 0, 2, 'skill-a'),
      makeChunk('p1', 1, 2, 'skill-a'),
    ];

    const expanded = expandSiblings(results, allChunks);
    assert.equal(expanded.length, 3, 'parentless result preserved');
    assert.equal(expanded[0].text, 'no parent');
  });
});
