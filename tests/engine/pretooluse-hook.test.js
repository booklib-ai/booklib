import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { formatInjection } from '../../hooks/pretooluse-inject.mjs';

describe('formatInjection', () => {
  it('includes correction text for post-training item', () => {
    const items = [
      {
        injection: {
          correction: 'fresh-pkg@2.0.0 (published 2026-01-15). Post-training.',
          constraint: null,
          example: null,
        },
        source: 'gap-detector',
      },
    ];

    const result = formatInjection(items);
    assert.ok(result.includes('fresh-pkg@2.0.0'));
    assert.ok(result.includes('Post-training'));
  });

  it('includes team constraint and example', () => {
    const items = [
      {
        injection: {
          correction: null,
          constraint: 'Use PaymentIntents not Charges API',
          example: 'stripe.paymentIntents.create({ amount })',
        },
        source: 'decisions',
      },
    ];

    const result = formatInjection(items);
    assert.ok(result.includes('decisions: Use PaymentIntents not Charges API'));
    assert.ok(result.includes('stripe.paymentIntents.create({ amount })'));
  });

  it('returns empty string for empty items', () => {
    assert.equal(formatInjection([]), '');
    assert.equal(formatInjection(null), '');
    assert.equal(formatInjection(undefined), '');
  });

  it('includes [BookLib] header', () => {
    const items = [
      {
        injection: {
          correction: null,
          constraint: 'Always validate input',
          example: null,
        },
        source: null,
      },
    ];

    const result = formatInjection(items);
    assert.ok(result.startsWith('[BookLib] Context for this edit:'));
  });
});
