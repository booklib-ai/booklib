import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import {
  extractKeywords,
  buildInjectionText,
  ContextMapBuilder,
  ContextMapMatcher,
} from '../../lib/engine/context-map.js';

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

// ── ContextMapBuilder ───────────────────────────────────────────────────────

describe('ContextMapBuilder', () => {
  it('buildFromKnowledge returns items with correct structure', async () => {
    const builder = new ContextMapBuilder({ processingMode: 'fast' });
    const items = [
      { id: 'rule-1', text: 'Use PaymentIntents from stripe for payments', source: 'decisions', type: 'decision' },
    ];
    const map = await builder.buildFromKnowledge(items);

    assert.equal(map.version, 1);
    assert.ok(map.builtAt);
    assert.equal(map.items.length, 1);

    const entry = map.items[0];
    assert.equal(entry.id, 'rule-1');
    assert.equal(entry.source, 'decisions');
    assert.ok(Array.isArray(entry.codeTerms));
    assert.ok(Array.isArray(entry.filePatterns));
    assert.ok(Array.isArray(entry.importTriggers));
    assert.ok(Array.isArray(entry.functionPatterns));
    assert.ok(entry.injection);
    assert.ok(entry.injection.constraint);
  });

  it('buildFromGaps creates post-training items with importTriggers', async () => {
    const builder = new ContextMapBuilder();
    const gaps = [
      { name: 'fresh-pkg', version: '2.0.0', ecosystem: 'npm', publishDate: '2026-01-15' },
    ];
    const map = await builder.buildFromGaps(gaps);

    assert.equal(map.items.length, 1);
    const entry = map.items[0];
    assert.equal(entry.id, 'gap:fresh-pkg');
    assert.equal(entry.type, 'post-training');
    assert.deepStrictEqual(entry.importTriggers, ['fresh-pkg']);
    assert.ok(entry.injection.correction.includes('fresh-pkg@2.0.0'));
    assert.ok(entry.injection.correction.includes('2026-01-15'));
  });

  it('save and load round-trip works', async () => {
    const builder = new ContextMapBuilder({ processingMode: 'fast' });
    const map = await builder.buildFromKnowledge([
      { id: 'rt-1', text: 'Always validate input with zod' },
    ]);

    const filePath = join(tmpdir(), `booklib-test-${randomUUID()}.json`);
    builder.save(filePath, map);

    const loaded = ContextMapBuilder.load(filePath);
    assert.deepStrictEqual(loaded, map);
  });

  it('load returns null for missing file', () => {
    const loaded = ContextMapBuilder.load('/nonexistent/path/map.json');
    assert.equal(loaded, null);
  });

  it('addItem increments items array', async () => {
    const builder = new ContextMapBuilder({ processingMode: 'fast' });
    const map = await builder.buildFromKnowledge([
      { id: 'a1', text: 'First rule about auth middleware' },
    ]);
    assert.equal(map.items.length, 1);

    await builder.addItem(map, { id: 'a2', text: 'Second rule about api routes' });
    assert.equal(map.items.length, 2);
    assert.equal(map.items[1].id, 'a2');
  });

  it('handles empty input', async () => {
    const builder = new ContextMapBuilder();
    const map = await builder.buildFromKnowledge([]);
    assert.equal(map.version, 1);
    assert.deepStrictEqual(map.items, []);

    const gapMap = await builder.buildFromGaps([]);
    assert.deepStrictEqual(gapMap.items, []);
  });

  it('fast mode keeps functionPatterns empty', async () => {
    const builder = new ContextMapBuilder({ processingMode: 'fast' });
    const map = await builder.buildFromKnowledge([
      { id: 'f1', text: 'Validate all stripe webhook signatures' },
    ]);
    assert.deepStrictEqual(map.items[0].functionPatterns, []);
  });

  it('api mode with mocked _callLLM populates functionPatterns', async () => {
    const builder = new ContextMapBuilder({ processingMode: 'api', apiKey: 'sk-ant-test' });

    // Override _callLLM to return predictable results
    builder._callLLM = async () => JSON.stringify([
      { index: 0, functionPatterns: ['handlePayment', 'processRefund'], importTriggers: ['stripe'] },
    ]);

    const map = await builder.buildFromKnowledge([
      { id: 'llm-1', text: 'Payment processing rules' },
    ]);

    const entry = map.items[0];
    assert.deepStrictEqual(entry.functionPatterns, ['handlePayment', 'processRefund']);
    assert.ok(entry.importTriggers.includes('stripe'));
  });
});

// ── ContextMapMatcher ───────────────────────────────────────────────────────

describe('ContextMapMatcher', () => {
  const sampleItems = [
    {
      id: 'stripe-rule',
      source: 'decisions',
      type: 'decision',
      codeTerms: ['payment', 'charge'],
      filePatterns: ['**/api/**'],
      importTriggers: ['stripe'],
      functionPatterns: ['handlePayment'],
      injection: { correction: null, constraint: 'Do not use Charges API. Use PaymentIntents.', example: null },
    },
    {
      id: 'zod-rule',
      source: 'decisions',
      type: 'decision',
      codeTerms: ['validation', 'schema'],
      filePatterns: ['**/api/**', '**/schema*/**'],
      importTriggers: ['zod'],
      functionPatterns: [],
      injection: { correction: null, constraint: 'Always validate with zod', example: null },
    },
    {
      id: 'auth-rule',
      source: 'decisions',
      type: 'decision',
      codeTerms: ['authenticate', 'token'],
      filePatterns: ['**/auth/**', '**/middleware/**'],
      importTriggers: ['passport'],
      functionPatterns: ['verifyToken'],
      injection: { correction: null, constraint: 'Use passport for auth', example: null },
    },
  ];

  it('matches by importTriggers (strongest signal)', () => {
    const matcher = new ContextMapMatcher(sampleItems);
    const results = matcher.match('src/billing.js', 'processPayment()', ['stripe']);

    assert.ok(results.length > 0);
    assert.equal(results[0].id, 'stripe-rule');
    assert.ok(results[0]._strength >= 4);
  });

  it('matches by filePatterns', () => {
    const matcher = new ContextMapMatcher(sampleItems);
    const results = matcher.match('src/auth/login.js', 'someCode()', []);

    const authMatch = results.find(r => r.id === 'auth-rule');
    assert.ok(authMatch, 'should match auth-rule via filePattern');
    assert.ok(authMatch._strength >= 1);
  });

  it('matches by codeTerms in code block', () => {
    const matcher = new ContextMapMatcher(sampleItems);
    const results = matcher.match('src/utils/helper.js', 'const validation = schema.parse(input)', []);

    const zodMatch = results.find(r => r.id === 'zod-rule');
    assert.ok(zodMatch, 'should match zod-rule via codeTerms');
    assert.ok(zodMatch._strength >= 2);
  });

  it('returns empty for unrelated file', () => {
    const matcher = new ContextMapMatcher(sampleItems);
    const results = matcher.match('README.md', 'hello world', []);

    assert.equal(results.length, 0);
  });

  it('sorts by match strength descending', () => {
    const matcher = new ContextMapMatcher(sampleItems);
    // stripe-rule gets importTrigger(4) + codeTerm(2) + filePattern(1) = 7
    // zod-rule gets codeTerm(2) + filePattern(1) = 3
    const results = matcher.match(
      'src/api/pay.js',
      'charge payment validation schema',
      ['stripe'],
    );

    assert.ok(results.length >= 2);
    for (let i = 1; i < results.length; i++) {
      assert.ok(results[i - 1]._strength >= results[i]._strength);
    }
  });

  it('caps results at 5 items', () => {
    // Create 8 items that all match
    const manyItems = Array.from({ length: 8 }, (_, i) => ({
      id: `item-${i}`,
      source: 'test',
      type: 'decision',
      codeTerms: ['shared'],
      filePatterns: ['**'],
      importTriggers: [],
      functionPatterns: [],
      injection: { correction: null, constraint: 'some rule', example: null },
    }));

    const matcher = new ContextMapMatcher(manyItems);
    const results = matcher.match('any/file.js', 'shared code here', []);

    assert.ok(results.length <= 5);
  });

  it('checkContradictions finds prohibited terms in code', () => {
    const matcher = new ContextMapMatcher([]);
    const items = [sampleItems[0]]; // "Do not use Charges API"

    const violations = matcher.checkContradictions(
      'const charge = stripe.charges.create({ amount: 100 })',
      items,
    );

    assert.ok(violations.length > 0);
    assert.equal(violations[0].id, 'stripe-rule');
    assert.ok(violations[0].constraint.length > 0);
  });

  it('checkContradictions returns empty when no violation', () => {
    const matcher = new ContextMapMatcher([]);
    const items = [sampleItems[0]];

    const violations = matcher.checkContradictions(
      'const intent = stripe.paymentIntents.create({ amount: 100 })',
      items,
    );

    assert.equal(violations.length, 0);
  });

  it('post-training items need importTriggers to match, not just ** glob', () => {
    const postTrainingItem = {
      id: 'gap:new-pkg',
      source: 'gap-detector',
      type: 'post-training',
      codeTerms: [],
      filePatterns: ['**'],
      importTriggers: ['new-pkg'],
      functionPatterns: [],
      injection: { correction: 'new-pkg@1.0.0. Post-training.', constraint: null, example: null },
    };

    const matcher = new ContextMapMatcher([postTrainingItem]);

    // Without the import, post-training item should NOT match
    const noImport = matcher.match('src/any/file.js', 'some code', []);
    assert.equal(noImport.length, 0);

    // With the import, it should match
    const withImport = matcher.match('src/any/file.js', 'some code', ['new-pkg']);
    assert.equal(withImport.length, 1);
    assert.equal(withImport[0].id, 'gap:new-pkg');
  });
});
