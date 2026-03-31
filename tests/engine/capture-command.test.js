import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCaptureLinkArgs } from '../../lib/engine/graph.js';

test('parseCaptureLinkArgs returns empty array for empty string', () => {
  assert.deepStrictEqual(parseCaptureLinkArgs(''), []);
});

test('parseCaptureLinkArgs parses single link', () => {
  const result = parseCaptureLinkArgs('effective-kotlin:applies-to');
  assert.deepStrictEqual(result, [{ to: 'effective-kotlin', type: 'applies-to' }]);
});

test('parseCaptureLinkArgs parses multiple links', () => {
  const result = parseCaptureLinkArgs('effective-kotlin:applies-to,design-patterns:see-also');
  assert.deepStrictEqual(result, [
    { to: 'effective-kotlin', type: 'applies-to' },
    { to: 'design-patterns', type: 'see-also' },
  ]);
});

test('parseCaptureLinkArgs trims whitespace', () => {
  const result = parseCaptureLinkArgs(' effective-kotlin : applies-to ');
  assert.deepStrictEqual(result, [{ to: 'effective-kotlin', type: 'applies-to' }]);
});

test('parseCaptureLinkArgs skips malformed pairs without colon', () => {
  const result = parseCaptureLinkArgs('effective-kotlin,design-patterns:see-also');
  assert.deepStrictEqual(result, [{ to: 'design-patterns', type: 'see-also' }]);
});

test('parseCaptureLinkArgs handles skill names with hyphens', () => {
  const result = parseCaptureLinkArgs('clean-code-reviewer:see-also');
  assert.deepStrictEqual(result, [{ to: 'clean-code-reviewer', type: 'see-also' }]);
});
