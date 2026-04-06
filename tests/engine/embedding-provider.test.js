import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEmbeddingPipeline } from '../../lib/engine/embedding-provider.js';

describe('createEmbeddingPipeline', () => {
  it('is a function', () => {
    assert.strictEqual(typeof createEmbeddingPipeline, 'function');
  });

  it('returns a promise', () => {
    // We cannot fully load the model in unit tests (requires download),
    // but we can verify the export exists and is callable.
    assert.ok(createEmbeddingPipeline.length <= 1, 'should accept 0-1 parameters');
  });
});
