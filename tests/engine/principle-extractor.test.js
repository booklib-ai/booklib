import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { extractPrinciples, extractFromResults } from '../../lib/engine/principle-extractor.js';

describe('extractPrinciples', () => {
  test('extracts bullet points', () => {
    const text = `- Use stateless JWT with OncePerRequestFilter
- Validate tokens per-request, don't store sessions
- Use httpOnly, Secure, SameSite=Strict cookies`;

    const results = extractPrinciples(text, { name: 'springboot-security', type: 'core_principles' });
    assert.strictEqual(results.length, 3);
    assert.ok(results[0].principle.includes('stateless JWT'));
    assert.strictEqual(results[0].source, 'springboot-security');
    assert.strictEqual(results[0].section, 'core_principles');
  });

  test('extracts numbered items', () => {
    const text = `1. Functions should do one thing
2. Keep functions short — under 20 lines
3. Max 3 parameters`;

    const results = extractPrinciples(text, { name: 'clean-code-reviewer' });
    assert.strictEqual(results.length, 3);
    assert.ok(results[0].principle.includes('Functions should do one thing'));
  });

  test('extracts bold headers with descriptions', () => {
    const text = `**Intention-revealing names**: Does the name tell you why it exists?

**No disinformation**: Does the name avoid misleading readers?`;

    const results = extractPrinciples(text, { name: 'clean-code-reviewer' });
    assert.strictEqual(results.length, 2);
    assert.ok(results[0].principle.includes('Intention-revealing names'));
    assert.ok(results[0].context.includes('tell you why'));
  });

  test('handles unstructured text as single principle', () => {
    const text = 'Kotlin null safety prevents null pointer exceptions through the type system.';
    const results = extractPrinciples(text, { name: 'effective-kotlin' });
    assert.strictEqual(results.length, 1);
    assert.ok(results[0].principle.includes('Kotlin null safety'));
  });

  test('returns empty for empty input', () => {
    assert.strictEqual(extractPrinciples('', {}).length, 0);
    assert.strictEqual(extractPrinciples(null, {}).length, 0);
  });
});

describe('extractFromResults', () => {
  test('extracts and deduplicates across results', () => {
    const results = [
      { text: '- Use JWT tokens\n- Validate per request', metadata: { name: 'skill-a' }, score: 0.9 },
      { text: '- Use JWT tokens\n- Enable CORS properly', metadata: { name: 'skill-b' }, score: 0.8 },
    ];
    const principles = extractFromResults(results, 5);
    assert.strictEqual(principles.length, 3); // JWT deduped, validate + CORS unique
  });

  test('respects maxPrinciples cap', () => {
    const results = [
      { text: '- A\n- B\n- C\n- D\n- E\n- F', metadata: { name: 'test' }, score: 0.9 },
    ];
    const principles = extractFromResults(results, 3);
    assert.strictEqual(principles.length, 3);
  });
});
