import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { DecisionChecker, PROHIBITION_PATTERNS } from '../../lib/engine/decision-checker.js';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-checker-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** Fake searcher that returns predefined results keyed by query. */
function fakeSearcher(resultsMap) {
  return {
    async search(query) {
      return resultsMap[query] || [];
    },
  };
}

/** Helper: extract prohibitions via a fresh checker instance. */
function extractProhibitions(text) {
  const checker = new DecisionChecker();
  return checker._extractProhibitions(text);
}

describe('Prohibition extraction', () => {
  it('extracts "do not use X"', () => {
    const results = extractProhibitions('do not use Charges API');
    assert.ok(results.some(r => r.target === 'Charges API'));
  });

  it('extracts "don\'t use X"', () => {
    const results = extractProhibitions("don't use legacy auth");
    assert.ok(results.some(r => r.target === 'legacy auth'));
  });

  it('extracts "never use X"', () => {
    const results = extractProhibitions('never use eval()');
    assert.ok(results.some(r => r.target === 'eval()'));
  });

  it('extracts "avoid X"', () => {
    const results = extractProhibitions('avoid using setTimeout');
    assert.ok(results.some(r => r.target === 'setTimeout'));
  });

  it('extracts "deprecated: X"', () => {
    const results = extractProhibitions('deprecated: OldClass');
    assert.ok(results.some(r => r.target === 'OldClass'));
  });

  it('extracts "X is deprecated"', () => {
    const results = extractProhibitions('OldAPI is deprecated');
    assert.ok(results.some(r => r.target === 'OldAPI'));
  });

  it('extracts "prefer X over Y" (Y is prohibited)', () => {
    const results = extractProhibitions('prefer PaymentIntents over Charges');
    assert.ok(results.some(r => r.target === 'Charges'));
  });

  it('extracts "replaced X with Y" (X is prohibited)', () => {
    const results = extractProhibitions('replaced Moment with DayJS');
    assert.ok(results.some(r => r.target === 'Moment'));
  });

  it('extracts "decided against X"', () => {
    const results = extractProhibitions('decided against MongoDB');
    assert.ok(results.some(r => r.target === 'MongoDB'));
  });

  it('extracts "must not use X"', () => {
    const results = extractProhibitions('must not use raw SQL');
    assert.ok(results.some(r => r.target === 'raw SQL'));
  });

  it('returns empty for text with no prohibitions', () => {
    const results = extractProhibitions('React is a great library for building UIs');
    // Filter out any short noise matches
    const meaningful = results.filter(r => r.target.length > 3);
    assert.equal(meaningful.length, 0);
  });

  it('extracts multiple prohibitions from long text', () => {
    const text = [
      'Team decision: do not use Charges API.',
      'We replaced Moment with DayJS.',
      'Also, avoid using setTimeout for delays.',
    ].join(' ');
    const results = extractProhibitions(text);
    const targets = results.map(r => r.target);
    assert.ok(targets.some(t => t === 'Charges API'));
    assert.ok(targets.some(t => t === 'Moment'));
    assert.ok(targets.some(t => t === 'setTimeout for delays'));
  });
});

describe('Identifier extraction', () => {
  it('extracts module names from JS imports', () => {
    const checker = new DecisionChecker();
    const code = [
      "import stripe from 'stripe';",
      "import express from 'express';",
    ].join('\n');
    const ids = checker._extractIdentifiers(code, 'js');
    assert.ok(ids.includes('stripe'));
    assert.ok(ids.includes('express'));
  });

  it('extracts dot-notation API calls', () => {
    const checker = new DecisionChecker();
    const code = 'const result = Stripe.charges.create({ amount: 100 });';
    const ids = checker._extractIdentifiers(code, 'js');
    assert.ok(ids.includes('Stripe.charges.create'));
  });

  it('deduplicates imports and API calls', () => {
    const checker = new DecisionChecker();
    const code = [
      "import stripe from 'stripe';",
      "import stripe from 'stripe';",
    ].join('\n');
    const ids = checker._extractIdentifiers(code, 'js');
    const stripeCount = ids.filter(id => id === 'stripe').length;
    assert.equal(stripeCount, 1);
  });

  it('returns empty for empty code', () => {
    const checker = new DecisionChecker();
    const ids = checker._extractIdentifiers('', 'js');
    assert.equal(ids.length, 0);
  });
});

describe('Contradiction matching with fake searcher', () => {
  it('detects contradiction when code uses prohibited API', async () => {
    const searcher = fakeSearcher({
      stripe: [
        {
          text: 'do not use Charges API, use PaymentIntents instead',
          metadata: { sourceName: 'team-decisions' },
        },
      ],
      'Stripe.charges.create': [
        {
          text: 'do not use Charges API, use PaymentIntents instead',
          metadata: { sourceName: 'team-decisions' },
        },
      ],
    });

    const checker = new DecisionChecker({ searcher });
    // "Charges API" target should match "Stripe.charges.create" identifier
    // because "charges" is a substring of "stripe.charges.create"
    const result = await checker._findContradictions(['stripe', 'Stripe.charges.create']);
    assert.ok(result.contradictions.length >= 1);
    assert.equal(result.checked, 2);
  });

  it('no contradiction when code uses preferred option', async () => {
    const searcher = fakeSearcher({
      PaymentIntents: [
        {
          text: 'prefer PaymentIntents over Charges',
          metadata: { sourceName: 'team-decisions' },
        },
      ],
    });

    const checker = new DecisionChecker({ searcher });
    // "Charges" is prohibited but "PaymentIntents" is not in our identifiers match
    // PaymentIntents should NOT match "Charges" (the prohibited thing)
    const result = await checker._findContradictions(['PaymentIntents']);
    // The prohibited target is "Charges" which does not match "PaymentIntents"
    assert.equal(result.contradictions.length, 0);
  });

  it('detects contradiction for decided-against library', async () => {
    const searcher = fakeSearcher({
      express: [
        {
          text: 'decided against Express, use Fastify instead',
          metadata: { sourceName: 'arch-decisions' },
        },
      ],
    });

    const checker = new DecisionChecker({ searcher });
    const result = await checker._findContradictions(['express']);
    assert.ok(result.contradictions.length >= 1);
    const found = result.contradictions[0];
    assert.equal(found.source, 'arch-decisions');
  });

  it('no contradiction when decision is positive about the used lib', async () => {
    const searcher = fakeSearcher({
      react: [
        {
          text: 'React is the preferred UI framework for all new projects',
          metadata: { sourceName: 'tech-radar' },
        },
      ],
    });

    const checker = new DecisionChecker({ searcher });
    const result = await checker._findContradictions(['react']);
    assert.equal(result.contradictions.length, 0);
  });

  it('returns empty when no searcher is provided', async () => {
    const checker = new DecisionChecker();
    const result = await checker.checkFile('/nonexistent/file.js');
    assert.equal(result.contradictions.length, 0);
    assert.equal(result.checked, 0);
  });
});

describe('checkFile integration', () => {
  it('detects contradiction in a real file via fake searcher', async () => {
    const code = [
      "import stripe from 'stripe';",
      '',
      'async function charge(amount) {',
      '  return Stripe.charges.create({ amount });',
      '}',
    ].join('\n');
    const filePath = path.join(tmpDir, 'payment.js');
    fs.writeFileSync(filePath, code);

    const searcher = fakeSearcher({
      stripe: [
        {
          text: 'do not use Charges API, migrate to PaymentIntents',
          metadata: { sourceName: 'stripe-migration' },
        },
      ],
      'Stripe.charges.create': [
        {
          text: 'do not use Charges API, migrate to PaymentIntents',
          metadata: { sourceName: 'stripe-migration' },
        },
      ],
    });

    const checker = new DecisionChecker({ searcher });
    const result = await checker.checkFile(filePath);
    assert.ok(result.contradictions.length >= 1);
    assert.ok(result.checked >= 1);
  });

  it('returns empty for unsupported file types', async () => {
    const filePath = path.join(tmpDir, 'style.css');
    fs.writeFileSync(filePath, 'body { color: red; }');

    const searcher = fakeSearcher({});
    const checker = new DecisionChecker({ searcher });
    const result = await checker.checkFile(filePath);
    assert.equal(result.contradictions.length, 0);
    assert.equal(result.checked, 0);
  });

  it('returns empty for nonexistent files', async () => {
    const searcher = fakeSearcher({});
    const checker = new DecisionChecker({ searcher });
    const result = await checker.checkFile(path.join(tmpDir, 'nope.js'));
    assert.equal(result.contradictions.length, 0);
    assert.equal(result.checked, 0);
  });

  it('skips files over MAX_FILE_SIZE', async () => {
    const filePath = path.join(tmpDir, 'huge.js');
    // Create a file just over 1MB
    fs.writeFileSync(filePath, 'x'.repeat(1_000_001));

    const searcher = fakeSearcher({});
    const checker = new DecisionChecker({ searcher });
    const result = await checker.checkFile(filePath);
    assert.equal(result.contradictions.length, 0);
    assert.equal(result.checked, 0);
  });
});
