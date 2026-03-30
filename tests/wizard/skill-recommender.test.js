// tests/wizard/skill-recommender.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cosine, filterAndRank } from '../../lib/wizard/skill-recommender.js';

test('cosine of identical vectors is 1', () => {
  const v = [0.5, 0.3, 0.8];
  assert.ok(Math.abs(cosine(v, v) - 1) < 0.001);
});

test('cosine of orthogonal vectors is 0', () => {
  assert.ok(Math.abs(cosine([1, 0], [0, 1])) < 0.001);
});

test('filterAndRank excludes installed skills', () => {
  const catalog = [
    { name: 'a', description: 'alpha', score: 0.9 },
    { name: 'b', description: 'beta',  score: 0.8 },
    { name: 'c', description: 'gamma', score: 0.7 },
  ];
  const result = filterAndRank(catalog, { installedNames: ['b'], available: 10 });
  assert.ok(!result.find(s => s.name === 'b'));
  assert.equal(result[0].name, 'a');
});

test('filterAndRank respects available slot count', () => {
  const catalog = [
    { name: 'a', score: 0.9 },
    { name: 'b', score: 0.8 },
    { name: 'c', score: 0.7 },
  ];
  const result = filterAndRank(catalog, { installedNames: [], available: 2 });
  assert.equal(result.length, 2);
});
