import { pipeline } from '@huggingface/transformers';
import { execSync } from 'node:child_process';
import os from 'node:os';

const BATCH_SIZE = 32;
const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

/**
 * Detect the best available ONNX execution provider for embedding inference.
 * Priority: CoreML (macOS Apple Silicon) > DirectML (Windows) > CUDA (Linux) > CPU.
 * @returns {Promise<{ provider: string, device: string, name: string, suggestion?: string }>}
 */
export async function detectProvider() {
  const platform = os.platform();

  // Attempt runtime introspection via onnxruntime-node (transitive dep)
  try {
    const ort = await import('onnxruntime-node');
    if (typeof ort.listSupportedBackends === 'function') {
      const backends = ort.listSupportedBackends();
      const available = new Set(backends.map(b => b.name));

      if (available.has('coreml')) return { provider: 'coreml', device: 'coreml', name: 'CoreML (Apple Silicon)' };
      if (available.has('dml')) return { provider: 'dml', device: 'dml', name: 'DirectML (GPU)' };
      if (available.has('cuda')) return { provider: 'cuda', device: 'cuda', name: 'CUDA (NVIDIA GPU)' };
    }
  } catch {
    // onnxruntime-node unavailable or listSupportedBackends missing — fall through
  }

  // Fallback: platform-based heuristics
  if (platform === 'darwin') {
    try {
      const cpuBrand = execSync('sysctl -n machdep.cpu.brand_string', { stdio: 'pipe' }).toString();
      if (cpuBrand.includes('Apple')) {
        return { provider: 'coreml', device: 'coreml', name: 'CoreML (Apple Silicon)' };
      }
    } catch {
      // sysctl unavailable — unlikely on macOS but safe to ignore
    }
  }

  if (platform === 'win32') {
    return { provider: 'dml', device: 'dml', name: 'DirectML (GPU)' };
  }

  if (platform === 'linux') {
    try {
      execSync('nvidia-smi', { stdio: 'pipe' });
      // GPU present — check for CUDA toolkit
      try {
        execSync('nvcc --version', { stdio: 'pipe' });
        return { provider: 'cuda', device: 'cuda', name: 'CUDA (NVIDIA GPU)' };
      } catch {
        return {
          provider: 'cpu', device: 'cpu', name: 'CPU',
          suggestion: 'NVIDIA GPU detected but no CUDA toolkit. Install for 5-10x faster indexing:\n  Ubuntu/Debian: sudo apt install nvidia-cuda-toolkit\n  Fedora: sudo dnf install cuda-toolkit',
        };
      }
    } catch {
      // no nvidia-smi — no NVIDIA GPU
    }
  }

  return { provider: 'cpu', device: 'cpu', name: 'CPU' };
}

/**
 * Create an embedding pipeline configured for the best available provider.
 * Falls back to CPU automatically if the preferred provider fails.
 * @param {object} [opts]
 * @param {boolean} [opts.quiet] - Suppress informational console output.
 * @returns {Promise<{ extractor: Function, providerInfo: { provider: string, device: string, name: string, suggestion?: string } }>}
 */
export async function createEmbeddingPipeline(opts = {}) {
  const { quiet = false } = opts;
  const providerInfo = await detectProvider();

  if (!quiet && providerInfo.suggestion) {
    console.log(`  ${providerInfo.suggestion}`);
  }

  const pipelineOpts = {};

  if (providerInfo.provider !== 'cpu') {
    // CoreML needs session_options — Transformers.js doesn't support device: 'coreml' yet
    if (providerInfo.provider === 'coreml') {
      pipelineOpts.session_options = {
        executionProviders: ['coreml', 'cpu'],
      };
    } else {
      pipelineOpts.device = providerInfo.device;
    }

    if (!quiet) {
      console.log(`  Using ${providerInfo.name} for embeddings`);
    }
  }

  // Use quantized int8 model for faster CPU inference
  if (providerInfo.provider === 'cpu') {
    pipelineOpts.dtype = 'q8';
    if (!quiet) {
      console.log(`  Using CPU (quantized int8) for embeddings`);
    }
  }

  try {
    // Suppress ONNX runtime warnings (CoreML partial support, node assignment)
    process.env.ORT_LOG_LEVEL = 'ERROR';
    try {
      const ort = await import('onnxruntime-node');
      if (ort?.env) ort.env.logLevel = 'error';
    } catch { /* onnxruntime-node may be a transitive dep */ }

    const extractor = await pipeline('feature-extraction', MODEL_NAME, pipelineOpts);
    return { extractor, providerInfo };
  } catch {
    // GPU provider failed — always fall back to CPU rather than crashing
    if (providerInfo.provider !== 'cpu') {
      if (!quiet) {
        console.log(`  ${providerInfo.name} failed, falling back to CPU`);
      }
      const extractor = await pipeline('feature-extraction', MODEL_NAME, { dtype: 'q8' });
      return {
        extractor,
        providerInfo: { ...providerInfo, provider: 'cpu', name: 'CPU (fallback)' },
      };
    }
    throw new Error('Failed to load embedding model');
  }
}

/**
 * Embed multiple texts in batches for throughput.
 * The extractor accepts an array of strings and returns concatenated vectors.
 * @param {Function} extractor - Pipeline function from createEmbeddingPipeline.
 * @param {string[]} texts - Texts to embed.
 * @param {number} [batchSize=32] - Texts per batch.
 * @param {Function} [onBatch] - Progress callback: ({ done: number, total: number }) => void.
 * @returns {Promise<number[][]>} One embedding vector per input text.
 */
export async function batchEmbed(extractor, texts, batchSize = BATCH_SIZE, onBatch) {
  const allVectors = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const outputs = await extractor(batch, { pooling: 'mean', normalize: true });

    // outputs.data is a flat Float32Array; dims is [batchLen, embeddingDim]
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
