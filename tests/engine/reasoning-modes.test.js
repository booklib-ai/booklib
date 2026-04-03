import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { processResults, formatResultsForModel } from '../../lib/engine/reasoning-modes.js';

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
    // Clear env keys to force fallback
    const savedAnthropic = process.env.ANTHROPIC_API_KEY;
    const savedOpenAI = process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const result = await processResults('auth patterns', mockResults, 'api', {});
    // Restore
    if (savedAnthropic) process.env.ANTHROPIC_API_KEY = savedAnthropic;
    if (savedOpenAI) process.env.OPENAI_API_KEY = savedOpenAI;
    assert.ok(result.mode === 'api-fallback' || result.mode === 'api-error');
    assert.ok(result.note);
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

test('formatResultsForModel produces clean chunk text without frontmatter', async () => {
  const results = [
    {
      text: 'Use parameterized queries with $1 placeholders',
      metadata: { name: 'ADR-003', parentTitle: 'Raw SQL — Rules', type: 'framework' },
    },
    {
      text: 'Never concatenate user input into SQL strings',
      metadata: { name: 'ADR-003', parentTitle: 'Raw SQL — Rules', type: 'framework' },
    },
    {
      text: 'Use sealed classes for representing state',
      metadata: { name: 'effective-kotlin', parentTitle: 'Classes', type: 'framework' },
    },
  ];

  const formatted = formatResultsForModel(results);

  assert.ok(!formatted.includes('---'), 'should not contain frontmatter delimiters');
  assert.ok(!formatted.includes('created:'), 'should not contain frontmatter fields');
  assert.ok(formatted.includes('ADR-003'), 'should include source name');
  assert.ok(formatted.includes('parameterized queries'), 'should include chunk text');
  assert.ok(formatted.includes('effective-kotlin'), 'should include second source');
});

test('formatResultsForModel returns (no results) for empty input', () => {
  assert.strictEqual(formatResultsForModel([]), '(no results)');
  assert.strictEqual(formatResultsForModel(null), '(no results)');
  assert.strictEqual(formatResultsForModel(undefined), '(no results)');
});
