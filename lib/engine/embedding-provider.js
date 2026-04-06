// lib/engine/embedding-provider.js
// Suppress ONNX runtime warnings before native module loads
process.env.ORT_LOG_LEVEL = 'ERROR';

import { pipeline } from '@huggingface/transformers';

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
const BATCH_SIZE = 32;

let _cachedPipeline = null;

/**
 * Returns a shared embedding pipeline (singleton per process).
 * First call downloads/loads the model; subsequent calls return the cached instance.
 *
 * @param {Object} [opts]
 * @param {boolean} [opts.quiet=false] - Suppress loading message.
 * @returns {Promise<{ extractor: Function }>}
 */
export async function createEmbeddingPipeline(opts = {}) {
  if (_cachedPipeline) return _cachedPipeline;

  const { quiet = false } = opts;
  if (!quiet) {
    console.log('Loading local embedding model...');
  }

  const extractor = await pipeline('feature-extraction', MODEL_NAME, { dtype: 'q8' });
  _cachedPipeline = { extractor };
  return _cachedPipeline;
}

/**
 * Embed multiple texts in batches.
 * @param {Function} extractor - the pipeline function
 * @param {string[]} texts - array of texts to embed
 * @param {number} [batchSize=32]
 * @param {Function} [onBatch] - called after each batch with { done, total }
 * @returns {Promise<number[][]>} array of embedding vectors
 */
export async function batchEmbed(extractor, texts, batchSize = BATCH_SIZE, onBatch) {
  const allVectors = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const outputs = await extractor(batch, { pooling: 'mean', normalize: true });
    const dims = outputs.dims[outputs.dims.length - 1];
    for (let j = 0; j < batch.length; j++) {
      const start = j * dims;
      allVectors.push(Array.from(outputs.data.slice(start, start + dims)));
    }
    onBatch?.({ done: Math.min(i + batchSize, texts.length), total: texts.length });
  }
  return allVectors;
}

export { BATCH_SIZE, MODEL_NAME };
