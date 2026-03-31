import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { expandQuery, extractKeywords } from '../../lib/engine/query-expander.js';

describe('expandQuery', () => {
  it('returns original query in result', () => {
    assert.strictEqual(expandQuery('null safety kotlin').original, 'null safety kotlin');
  });

  it('returns at least one expanded query variant', () => {
    const result = expandQuery('null safety kotlin');
    assert.ok(result.expanded.length >= 1);
  });

  it('keywords strips stopwords', () => {
    const result = expandQuery('how to handle null values in Kotlin');
    assert.ok(!result.keywords.includes('how'));
    assert.ok(!result.keywords.includes('to'));
    assert.ok(!result.keywords.includes('in'));
    assert.ok(result.keywords.includes('handle'));
    assert.ok(result.keywords.includes('null'));
    assert.ok(result.keywords.includes('values'));
    assert.ok(result.keywords.includes('kotlin'));
  });

  it('handles single-word query without error', () => {
    const result = expandQuery('kotlin');
    assert.strictEqual(result.original, 'kotlin');
    assert.ok(result.expanded.length >= 1);
  });

  it('expanded variants do not include the original query verbatim', () => {
    const result = expandQuery('null safety kotlin');
    assert.ok(!result.expanded.includes('null safety kotlin'));
  });
});
