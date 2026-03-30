import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findOwningComponents, scoreAndRankNodes } from '../../lib/engine/graph-injector.js';

test('findOwningComponents matches file path against component glob', () => {
  const components = [
    { id: 'comp_auth', paths: ['src/auth/**'], title: 'Auth' },
    { id: 'comp_pay',  paths: ['src/payments/**'], title: 'Payments' },
  ];
  const result = findOwningComponents('src/auth/middleware.js', components);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'comp_auth');
});

test('findOwningComponents returns empty array when no match', () => {
  const components = [
    { id: 'comp_auth', paths: ['src/auth/**'], title: 'Auth' },
  ];
  const result = findOwningComponents('src/payments/stripe.js', components);
  assert.equal(result.length, 0);
});

test('findOwningComponents matches multiple components', () => {
  const components = [
    { id: 'comp_auth', paths: ['src/auth/**', '**/middleware*'], title: 'Auth' },
    { id: 'comp_core', paths: ['src/**'], title: 'Core' },
  ];
  const result = findOwningComponents('src/auth/util.js', components);
  const ids = result.map(c => c.id);
  assert.ok(ids.includes('comp_auth'));
  assert.ok(ids.includes('comp_core'));
});

test('scoreAndRankNodes deduplicates by id keeping highest score', () => {
  const nodes = [
    { id: 'a', score: 0.9, text: 'foo', hop: 0 },
    { id: 'a', score: 0.8, text: 'foo', hop: 1 },
    { id: 'b', score: 0.7, text: 'bar', hop: 0 },
  ];
  const ranked = scoreAndRankNodes(nodes);
  assert.equal(ranked.filter(n => n.id === 'a').length, 1);
  assert.equal(ranked[0].id, 'a');
  assert.equal(ranked[0].score, 0.9);
});
