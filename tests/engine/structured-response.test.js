import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildStructuredResponse } from '../../lib/engine/structured-response.js';

describe('buildStructuredResponse', () => {
  test('returns structured principles from results', () => {
    const results = [
      { text: '- Use stateless JWT\n- Validate per request', metadata: { name: 'springboot-security', type: 'core_principles' }, score: 0.9 },
    ];
    const response = buildStructuredResponse('auth patterns', results);
    assert.strictEqual(response.query, 'auth patterns');
    assert.ok(response.results.length > 0);
    assert.ok(response.results[0].principle);
    assert.ok(response.results[0].source);
    assert.ok(response.note.includes('result'));
  });

  test('returns empty with note when no results', () => {
    const response = buildStructuredResponse('something obscure', []);
    assert.strictEqual(response.results.length, 0);
    assert.strictEqual(response.note, 'No relevant knowledge found.');
  });

  test('includes file in response when provided', () => {
    const response = buildStructuredResponse('auth', [], { file: 'src/auth/JwtFilter.java' });
    assert.strictEqual(response.file, 'src/auth/JwtFilter.java');
  });

  test('respects maxPrinciples', () => {
    const results = [
      { text: '- A\n- B\n- C\n- D\n- E', metadata: { name: 'test' }, score: 0.9 },
    ];
    const response = buildStructuredResponse('test', results, { maxPrinciples: 2 });
    assert.ok(response.results.length <= 2);
  });
});
