import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildMetadataPrefix } from '../../lib/engine/indexer.js';

describe('buildMetadataPrefix', () => {
  test('returns prefix with skill name, type, and tags', () => {
    const prefix = buildMetadataPrefix({
      name: 'effective-kotlin',
      type: 'anti_patterns',
      tags: ['kotlin', 'jvm'],
    });
    assert.strictEqual(prefix, '[skill:effective-kotlin] [type:anti_patterns] [tags:kotlin,jvm] ');
  });

  test('returns prefix with name only when type and tags are missing', () => {
    const prefix = buildMetadataPrefix({ name: 'clean-code-reviewer' });
    assert.strictEqual(prefix, '[skill:clean-code-reviewer] ');
  });

  test('returns empty string when metadata has no relevant fields', () => {
    const prefix = buildMetadataPrefix({ filePath: 'some/path.md' });
    assert.strictEqual(prefix, '');
  });

  test('omits tags bracket when tags array is empty', () => {
    const prefix = buildMetadataPrefix({ name: 'effective-java', type: 'summary', tags: [] });
    assert.strictEqual(prefix, '[skill:effective-java] [type:summary] ');
  });

  test('handles knowledge node metadata (title instead of name)', () => {
    const prefix = buildMetadataPrefix({
      title: 'Null Object Pattern',
      type: 'insight',
      tags: ['kotlin', 'patterns'],
    });
    assert.strictEqual(prefix, '[skill:Null Object Pattern] [type:insight] [tags:kotlin,patterns] ');
  });

  test('prefers name over title when both present', () => {
    const prefix = buildMetadataPrefix({
      name: 'effective-kotlin',
      title: 'Some Title',
      type: 'summary',
    });
    assert.strictEqual(prefix, '[skill:effective-kotlin] [type:summary] ');
  });
});
