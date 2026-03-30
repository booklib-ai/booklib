// tests/wizard/prompt.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sep, formatProgress } from '../../lib/wizard/prompt.js';

test('sep returns correct length string', () => {
  assert.equal(sep('─', 10).length, 10);
  assert.equal(sep('─', 10), '──────────');
});

test('formatProgress renders bar', () => {
  const s = formatProgress(15, 30, 20);
  assert.ok(s.includes('15/30'));
  assert.ok(s.includes('█'));
  assert.ok(s.includes('░'));
});
