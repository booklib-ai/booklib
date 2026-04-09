import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROVIDER_PATH = path.resolve(fileURLToPath(import.meta.url), '..', '..', 'lib', 'engine', 'embedding-provider.js');
const source = fs.readFileSync(PROVIDER_PATH, 'utf8');

describe('Embedding provider produces clean output (no CoreML warnings)', () => {

  it('ORT_LOG_LEVEL is set to ERROR before imports', () => {
    const ortLine = source.indexOf("process.env.ORT_LOG_LEVEL = 'ERROR'");
    const importLine = source.indexOf("import { pipeline }");
    assert.ok(ortLine >= 0, 'ORT_LOG_LEVEL should be set');
    assert.ok(ortLine < importLine, 'must be set BEFORE pipeline import');
  });

  it('does NOT use CoreML execution provider (CPU q8 is 20x faster for MiniLM-L6)', () => {
    assert.ok(!source.includes("'coreml'"),
      'CoreML should not be used — CPU int8 is faster for this small model and produces zero warnings');
  });

  it('uses CPU int8 quantization', () => {
    assert.ok(source.includes("dtype: 'q8'"),
      'should use q8 quantization for fast CPU inference');
  });

  it('does NOT use fd2 redirect — that breaks process.stderr', () => {
    assert.ok(!source.includes('closeSync(2)'), 'must not close fd 2');
    assert.ok(!source.includes("openSync('/dev/null'"), 'must not redirect to /dev/null');
  });

  it('does NOT set OS_ACTIVITY_MODE (not needed without CoreML)', () => {
    assert.ok(!source.includes('OS_ACTIVITY_MODE'),
      'OS_ACTIVITY_MODE not needed — CoreML is not used');
  });
});
