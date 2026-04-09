import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROVIDER_PATH = path.resolve(fileURLToPath(import.meta.url), '..', '..', 'lib', 'engine', 'embedding-provider.js');
const source = fs.readFileSync(PROVIDER_PATH, 'utf8');

describe('CoreML warning suppression is global and permanent', () => {

  it('ORT_LOG_LEVEL is set to ERROR at module top level', () => {
    // Must be set BEFORE any import of @huggingface/transformers
    const ortLine = source.indexOf("process.env.ORT_LOG_LEVEL = 'ERROR'");
    const importLine = source.indexOf("import { pipeline }");
    assert.ok(ortLine >= 0, 'ORT_LOG_LEVEL should be set');
    assert.ok(ortLine < importLine, 'ORT_LOG_LEVEL must be set BEFORE pipeline import');
  });

  it('OS_ACTIVITY_MODE is set globally on macOS, not per-call', () => {
    // Must be set at module load, not inside createEmbeddingPipeline
    const globalSet = source.indexOf("process.env.OS_ACTIVITY_MODE = 'disable'");
    const functionStart = source.indexOf('export async function createEmbeddingPipeline');
    assert.ok(globalSet >= 0, 'OS_ACTIVITY_MODE should be set');
    assert.ok(globalSet < functionStart,
      'OS_ACTIVITY_MODE must be set at module level, not inside the function — ' +
      'otherwise warnings reappear on every search/embed call');
  });

  it('OS_ACTIVITY_MODE is not restored/deleted after pipeline creation', () => {
    // If we restore it, warnings come back during embedding calls
    assert.ok(!source.includes("delete process.env.OS_ACTIVITY_MODE"),
      'should not delete OS_ACTIVITY_MODE — it must stay for the process lifetime');

    // Check there's no "origActivity" restore pattern
    assert.ok(!source.includes("process.env.OS_ACTIVITY_MODE = origActivity"),
      'should not restore OS_ACTIVITY_MODE to original value');
  });

  it('CoreML execution provider is still configured (GPU not disabled)', () => {
    assert.ok(source.includes("executionProviders: ['coreml', 'cpu']"),
      'CoreML should still be in the execution providers — only warnings are suppressed, not the GPU');
  });

  it('console.warn is only suppressed during model load, not permanently', () => {
    // console.warn suppression should be temporary (during pipeline creation)
    // and restored in the finally block
    const warnSuppressed = source.indexOf('console.warn = () => {}');
    const warnRestored = source.indexOf('console.warn = origWarn');
    assert.ok(warnSuppressed >= 0, 'console.warn should be suppressed during load');
    assert.ok(warnRestored >= 0, 'console.warn should be restored after load');
    assert.ok(warnRestored > warnSuppressed, 'restore must come after suppression');
  });
});
