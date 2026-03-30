// tests/wizard/registry-embeddings.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSkillCatalog, extractDescription } from '../../lib/wizard/registry-embeddings.js';

test('loadSkillCatalog returns non-empty array', () => {
  const catalog = loadSkillCatalog();
  assert.ok(catalog.length > 0, 'catalog should have skills');
});

test('catalog entries have name and description', () => {
  const catalog = loadSkillCatalog();
  for (const s of catalog) {
    assert.ok(typeof s.name === 'string' && s.name.length > 0, `${s.name}: missing name`);
    assert.ok(typeof s.description === 'string' && s.description.length > 0, `${s.name}: missing description`);
    assert.ok(['bundled', 'registry'].includes(s.source), `${s.name}: invalid source`);
  }
});

test('no duplicate names in catalog', () => {
  const catalog = loadSkillCatalog();
  const names = catalog.map(s => s.name);
  const unique = new Set(names);
  assert.equal(unique.size, names.length, 'duplicate skill names found');
});

test('extractDescription parses SKILL.md frontmatter', () => {
  const md = '---\nname: foo\ndescription: A useful skill for bar.\n---\n\n# Content';
  assert.equal(extractDescription(md), 'A useful skill for bar.');
});

test('extractDescription returns null when missing', () => {
  const md = '---\nname: foo\n---\n\n# Content';
  assert.equal(extractDescription(md), null);
});
