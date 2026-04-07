import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { extractKeywords, buildInjectionText } from '../../lib/engine/context-map.js';

describe('extractKeywords', () => {
  it('extracts code terms from API envelope text', () => {
    const { codeTerms } = extractKeywords(
      'All API responses must use {data, error, meta} envelope',
    );
    assert.ok(codeTerms.includes('api'));
    assert.ok(codeTerms.includes('responses'));
    assert.ok(codeTerms.includes('data'));
    assert.ok(codeTerms.includes('error'));
    assert.ok(codeTerms.includes('meta'));
    assert.ok(codeTerms.includes('envelope'));
  });

  it('extracts file patterns from admin endpoint text', () => {
    const { filePatterns } = extractKeywords(
      'Admin endpoints require role check middleware',
    );
    assert.ok(filePatterns.includes('**/admin/**'));
    assert.ok(filePatterns.includes('**/api/**'));
    assert.ok(filePatterns.includes('**/middleware/**'));
  });

  it('extracts import triggers from stripe text', () => {
    const { importTriggers } = extractKeywords(
      'Use PaymentIntents not Charges API from stripe',
    );
    assert.ok(importTriggers.includes('stripe'));
  });

  it('handles empty input with all empty arrays', () => {
    const result = extractKeywords('');
    assert.deepStrictEqual(result, {
      codeTerms: [],
      filePatterns: [],
      importTriggers: [],
    });
  });

  it('handles null/undefined input', () => {
    const result = extractKeywords(null);
    assert.deepStrictEqual(result, {
      codeTerms: [],
      filePatterns: [],
      importTriggers: [],
    });
  });

  it('deduplicates terms', () => {
    const { codeTerms } = extractKeywords('error error error handling');
    const errorCount = codeTerms.filter(t => t === 'error').length;
    assert.equal(errorCount, 1);
  });

  it('extracts quoted scoped package names', () => {
    const { importTriggers } = extractKeywords(
      "Import the client from '@supabase/supabase-js' for database access",
    );
    assert.ok(importTriggers.includes('@supabase/supabase-js'));
  });

  it('extracts quoted unscoped package names', () => {
    const { importTriggers } = extractKeywords(
      "Use 'zod' for schema validation",
    );
    assert.ok(importTriggers.includes('zod'));
  });

  it('filters stopwords from code terms', () => {
    const { codeTerms } = extractKeywords('the function should not be called');
    assert.ok(!codeTerms.includes('the'));
    assert.ok(!codeTerms.includes('should'));
    assert.ok(!codeTerms.includes('not'));
    assert.ok(!codeTerms.includes('be'));
  });

  it('filters short tokens from code terms', () => {
    const { codeTerms } = extractKeywords('a is an ok id');
    // "a", "is", "an", "ok", "id" are all under 3 chars or stopwords
    assert.ok(!codeTerms.includes('a'));
    assert.ok(!codeTerms.includes('is'));
    assert.ok(!codeTerms.includes('an'));
  });
});

describe('buildInjectionText', () => {
  it('returns constraint and null correction for a decision item', () => {
    const item = { text: 'All API responses must use {data, error, meta} envelope' };
    const result = buildInjectionText(item);

    assert.equal(result.correction, null);
    assert.equal(result.constraint, item.text.slice(0, 200));
  });

  it('extracts code example from item with code block', () => {
    const item = {
      text: [
        'Use this pattern for error responses:',
        '```json',
        '{ "data": null, "error": "Not found", "meta": {} }',
        '```',
      ].join('\n'),
    };
    const result = buildInjectionText(item);

    assert.equal(result.example, '{ "data": null, "error": "Not found", "meta": {} }');
    assert.equal(result.correction, null);
  });

  it('returns null example when no code block present', () => {
    const item = { text: 'Always validate user input before processing.' };
    const result = buildInjectionText(item);

    assert.equal(result.example, null);
    assert.equal(result.correction, null);
    assert.ok(result.constraint.length > 0);
  });

  it('truncates long text to 200 chars for constraint', () => {
    const longText = 'x'.repeat(500);
    const result = buildInjectionText({ text: longText });

    assert.equal(result.constraint.length, 200);
  });

  it('handles item with missing text gracefully', () => {
    const result = buildInjectionText({});
    assert.equal(result.correction, null);
    assert.equal(result.constraint, '');
    assert.equal(result.example, null);
  });
});
