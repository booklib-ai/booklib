import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { reciprocalRankFusion } from '../../lib/engine/rrf.js';

const makeList = (...names) => names.map((name, i) => ({
  score: 1 - i * 0.1,
  text: `text for ${name}`,
  metadata: { name },
}));

describe('reciprocalRankFusion', () => {
  it('merges two lists and returns items from both', () => {
    const result = reciprocalRankFusion([makeList('a','b','c'), makeList('b','c','d')]);
    const names = result.map(r => r.metadata.name);
    assert.ok(names.includes('a') && names.includes('b') && names.includes('c') && names.includes('d'));
  });

  it('items appearing in multiple lists score higher than single-list items', () => {
    const listA = makeList('shared', 'unique-a');
    const listB = makeList('shared', 'unique-b');
    const result = reciprocalRankFusion([listA, listB]);
    const sharedScore = result.find(r => r.metadata.name === 'shared').score;
    const uniqueAScore = result.find(r => r.metadata.name === 'unique-a').score;
    const uniqueBScore = result.find(r => r.metadata.name === 'unique-b').score;
    assert.ok(sharedScore > uniqueAScore && sharedScore > uniqueBScore);
  });

  it('respects weights — higher weight list contributes more', () => {
    const result = reciprocalRankFusion([makeList('only-in-a'), makeList('only-in-b')], { weights: [2, 1] });
    const scoreA = result.find(r => r.metadata.name === 'only-in-a').score;
    const scoreB = result.find(r => r.metadata.name === 'only-in-b').score;
    assert.ok(scoreA > scoreB);
  });

  it('deduplicates items that appear in multiple lists', () => {
    const result = reciprocalRankFusion([makeList('dup','x'), makeList('dup','y')]);
    assert.strictEqual(result.filter(r => r.metadata.name === 'dup').length, 1);
  });

  it('returns results sorted by score descending', () => {
    const result = reciprocalRankFusion([makeList('a','b','c'), makeList('c','b','a')]);
    for (let i = 1; i < result.length; i++) assert.ok(result[i-1].score >= result[i].score);
  });

  it('handles empty input lists', () => {
    assert.deepEqual(reciprocalRankFusion([]), []);
    assert.deepEqual(reciprocalRankFusion([[]]), []);
  });
});
