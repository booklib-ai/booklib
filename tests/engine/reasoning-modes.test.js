import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { processResults } from '../../lib/engine/reasoning-modes.js';

const mockResults = [
  { text: '- Use stateless JWT\n- Validate per request', metadata: { name: 'springboot-security', type: 'core_principles' }, score: 0.95 },
  { text: '- Name variables clearly', metadata: { name: 'clean-code', type: 'core_principles' }, score: 0.4 },
];

describe('processResults', () => {
  test('fast mode returns structured response', async () => {
    const result = await processResults('auth patterns', mockResults, 'fast');
    assert.ok(result.results.length > 0);
    assert.ok(result.note);
  });

  test('local mode falls back gracefully when Ollama unavailable', async () => {
    const result = await processResults('auth patterns', mockResults, 'local');
    // When Ollama is not running, falls back to fast with a note
    assert.ok(result.mode === 'local' || result.mode === 'local-fallback' || result.mode === 'local-error');
    assert.ok(result.results.length > 0);
  });

  test('api mode falls back when no API key', async () => {
    const result = await processResults('auth patterns', mockResults, 'api', {});
    assert.strictEqual(result.mode, 'api-fallback');
    assert.ok(result.note.includes('No API key'));
  });

  test('fast mode handles empty results', async () => {
    const result = await processResults('something', [], 'fast');
    assert.strictEqual(result.results.length, 0);
    assert.ok(result.note.includes('No relevant'));
  });

  test('unknown mode defaults to fast', async () => {
    const result = await processResults('test', mockResults, 'unknown');
    assert.ok(result.results.length > 0);
  });
});
