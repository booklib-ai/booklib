// tests/engine/benchmark-eval.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeMRR, computeRecall, computeNDCG } from '../../benchmark/run-eval.js';

describe('eval metrics', () => {
  it('MRR@5: rank 1 hit returns 1.0', () => {
    assert.strictEqual(computeMRR([['a', 'b', 'c']], [['a']], 5), 1.0);
  });

  it('MRR@5: rank 2 hit returns 0.5', () => {
    assert.strictEqual(computeMRR([['x', 'a', 'b']], [['a']], 5), 0.5);
  });

  it('MRR@5: no hit returns 0', () => {
    assert.strictEqual(computeMRR([['x', 'y', 'z']], [['a']], 5), 0);
  });

  it('Recall@5: all relevant in top 5 returns 1.0', () => {
    assert.strictEqual(computeRecall([['a', 'b', 'c']], [['a', 'b']], 5), 1.0);
  });

  it('Recall@5: no relevant returns 0', () => {
    assert.strictEqual(computeRecall([['x', 'y', 'z']], [['a']], 5), 0);
  });

  it('NDCG@5: perfect ranking returns 1.0', () => {
    const score = computeNDCG([['a', 'b']], [['a', 'b']], 5);
    assert.ok(Math.abs(score - 1.0) < 0.01);
  });
});
