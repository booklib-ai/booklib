import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { formatContradiction } from '../../hooks/posttooluse-contradict.mjs';

describe('formatContradiction', () => {
  it('includes constraint and fix example for a violation', () => {
    const contradictions = [
      {
        id: 'stripe-rule',
        constraint: 'Do not use Charges',
        example: 'stripe.paymentIntents.create({ amount })',
        source: 'decisions',
      },
    ];

    const result = formatContradiction(contradictions);
    assert.ok(result.includes('[BookLib] Contradiction detected:'));
    assert.ok(result.includes('Do not use Charges'));
    assert.ok(result.includes('Fix: stripe.paymentIntents.create({ amount })'));
  });

  it('returns empty string for empty contradictions', () => {
    assert.equal(formatContradiction([]), '');
    assert.equal(formatContradiction(null), '');
    assert.equal(formatContradiction(undefined), '');
  });
});
