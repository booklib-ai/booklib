import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WellKnownBuilder } from '../lib/well-known-builder.js';

function tmpDir() {
  return mkdtempSync(path.join(tmpdir(), 'booklib-wk-test-'));
}

test('generates skill.md at correct path', async () => {
  const outDir = tmpDir();
  const builder = new WellKnownBuilder({ outDir });
  const outPath = await builder.build();
  assert.ok(existsSync(outPath), `Expected file at ${outPath}`);
  rmSync(outDir, { recursive: true });
});

test('generated skill.md has valid frontmatter', async () => {
  const outDir = tmpDir();
  const builder = new WellKnownBuilder({ outDir });
  const outPath = await builder.build();
  const content = readFileSync(outPath, 'utf8');
  assert.ok(content.startsWith('---'), 'Missing frontmatter opening');
  assert.ok(content.includes('name: booklib-skills'), 'Missing name field');
  assert.ok(content.includes('description:'), 'Missing description field');
  rmSync(outDir, { recursive: true });
});

test('generated skill.md lists all bundled skills', async () => {
  const outDir = tmpDir();
  const builder = new WellKnownBuilder({ outDir });
  const outPath = await builder.build();
  const content = readFileSync(outPath, 'utf8');
  assert.ok(content.includes('effective-kotlin'), 'Missing effective-kotlin entry');
  assert.ok(content.includes('effective-python'), 'Missing effective-python entry');
  assert.ok(content.includes('clean-code-reviewer'), 'Missing clean-code-reviewer entry');
  rmSync(outDir, { recursive: true });
});
