// lib/engine/embedding-provider.js
import { pipeline } from '@huggingface/transformers';

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

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
