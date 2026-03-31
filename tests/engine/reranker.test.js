import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Reranker } from '../../lib/engine/reranker.js';

const CANDIDATES = [
  { score: 0.5, text: 'kotlin null safety avoid exceptions', metadata: { name: 'effective-kotlin' } },
  { score: 0.6, text: 'java null pointer best practices', metadata: { name: 'effective-java' } },
  { score: 0.4, text: 'typescript undefined checking', metadata: { name: 'effective-typescript' } },
];

function makeRerankerWithMock(scoreFn) {
  const reranker = new Reranker();
  let callIndex = 0;
  reranker._pipeline = async (inputs) => {
    return inputs.map(() => [{ label: 'LABEL_1', score: scoreFn(callIndex++) }]);
  };
  return reranker;
}

describe('Reranker', () => {
  it('returns same number of candidates', async () => {
    const reranker = makeRerankerWithMock(() => 0.5);
    const result = await reranker.rerank('null safety', CANDIDATES);
    assert.strictEqual(result.length, CANDIDATES.length);
  });

  it('sorts results by reranker score descending', async () => {
    const scores = [0.9, 0.3, 0.6];
    const reranker = makeRerankerWithMock((i) => scores[i]);
    const result = await reranker.rerank('null safety', CANDIDATES);
    for (let i = 1; i < result.length; i++) {
      assert.ok(result[i - 1].score >= result[i].score);
    }
  });

  it('preserves text and metadata on each result', async () => {
    const reranker = makeRerankerWithMock(() => 0.5);
    const result = await reranker.rerank('null safety', CANDIDATES);
    const names = result.map(r => r.metadata.name);
    assert.ok(names.includes('effective-kotlin'));
    assert.ok(names.includes('effective-java'));
    assert.ok(names.includes('effective-typescript'));
  });

  it('returns empty array for empty candidates without loading model', async () => {
    const reranker = new Reranker();
    // No _pipeline set — would throw if accessed
    const result = await reranker.rerank('query', []);
    assert.deepEqual(result, []);
  });
});
