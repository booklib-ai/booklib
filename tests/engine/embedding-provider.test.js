import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectProvider, batchEmbed, BATCH_SIZE, MODEL_NAME } from '../../lib/engine/embedding-provider.js';

/**
 * Fake extractor that mimics Transformers.js pipeline output shape.
 * Returns a flat Float32Array with predictable values per text.
 */
function fakeExtractor(texts, _opts) {
  const dims = 4;
  const data = new Float32Array(texts.length * dims);
  for (let i = 0; i < data.length; i++) {
    data[i] = i * 0.1;
  }
  return { data, dims: [texts.length, dims] };
}

describe('detectProvider', () => {
  it('returns an object with provider, device, and name', async () => {
    const info = await detectProvider();
    assert.ok(typeof info.provider === 'string', 'provider should be a string');
    assert.ok(typeof info.device === 'string', 'device should be a string');
    assert.ok(typeof info.name === 'string', 'name should be a string');
  });

  it('provider is one of the known backends', async () => {
    const info = await detectProvider();
    const valid = ['coreml', 'dml', 'cuda', 'cpu'];
    assert.ok(valid.includes(info.provider), `provider "${info.provider}" should be one of ${valid.join(', ')}`);
  });

  it('suggestion is a string when present', async () => {
    const info = await detectProvider();
    if (info.suggestion !== undefined) {
      assert.ok(typeof info.suggestion === 'string', 'suggestion should be a string');
    }
  });
});

describe('batchEmbed', () => {
  it('returns one vector per input text', async () => {
    const texts = ['hello world', 'foo bar', 'baz qux'];
    const vectors = await batchEmbed(fakeExtractor, texts, 32);
    assert.strictEqual(vectors.length, texts.length, 'should return same number of vectors as inputs');
  });

  it('each vector has the correct dimensionality', async () => {
    const texts = ['a', 'b'];
    const vectors = await batchEmbed(fakeExtractor, texts, 32);
    for (const vec of vectors) {
      assert.strictEqual(vec.length, 4, 'each vector should have 4 dimensions (fake extractor)');
    }
  });

  it('handles batch sizes larger than input', async () => {
    const texts = ['only one'];
    const vectors = await batchEmbed(fakeExtractor, texts, 100);
    assert.strictEqual(vectors.length, 1);
    assert.strictEqual(vectors[0].length, 4);
  });

  it('handles empty input', async () => {
    const vectors = await batchEmbed(fakeExtractor, [], 32);
    assert.strictEqual(vectors.length, 0);
  });

  it('splits into multiple batches when needed', async () => {
    const texts = Array.from({ length: 5 }, (_, i) => `text ${i}`);
    const batchSizes = [];
    const trackingExtractor = (batch, opts) => {
      batchSizes.push(batch.length);
      return fakeExtractor(batch, opts);
    };

    await batchEmbed(trackingExtractor, texts, 2);
    // 5 texts with batch size 2 = batches of [2, 2, 1]
    assert.deepStrictEqual(batchSizes, [2, 2, 1]);
  });

  it('calls onBatch callback with progress', async () => {
    const texts = ['a', 'b', 'c', 'd', 'e'];
    const progress = [];
    await batchEmbed(fakeExtractor, texts, 2, ({ done, total }) => {
      progress.push({ done, total });
    });

    assert.strictEqual(progress.length, 3, 'should call onBatch once per batch');
    assert.deepStrictEqual(progress[0], { done: 2, total: 5 });
    assert.deepStrictEqual(progress[1], { done: 4, total: 5 });
    assert.deepStrictEqual(progress[2], { done: 5, total: 5 });
  });

  it('produces correct vector values from flat array', async () => {
    const texts = ['first', 'second'];
    const vectors = await batchEmbed(fakeExtractor, texts, 32);

    // fakeExtractor fills Float32Array sequentially: 0, 0.1, 0.2, ...
    // first vector: indices 0..3 => [0, 0.1, 0.2, 0.3]
    // second vector: indices 4..7 => [0.4, 0.5, 0.6, 0.7]
    assert.ok(Math.abs(vectors[0][0] - 0.0) < 1e-6);
    assert.ok(Math.abs(vectors[0][3] - 0.3) < 1e-6);
    assert.ok(Math.abs(vectors[1][0] - 0.4) < 1e-6);
    assert.ok(Math.abs(vectors[1][3] - 0.7) < 1e-6);
  });
});

describe('constants', () => {
  it('BATCH_SIZE is a positive integer', () => {
    assert.strictEqual(typeof BATCH_SIZE, 'number');
    assert.ok(BATCH_SIZE > 0);
    assert.strictEqual(BATCH_SIZE, Math.floor(BATCH_SIZE));
  });

  it('MODEL_NAME is the expected model', () => {
    assert.strictEqual(MODEL_NAME, 'Xenova/all-MiniLM-L6-v2');
  });
});
