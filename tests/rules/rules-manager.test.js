// tests/rules/rules-manager.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, rmSync, mkdirSync, writeFileSync,
  existsSync, readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { listAvailable, installRule, status } from '../../lib/rules/rules-manager.js';

function tmp() { return mkdtempSync(join(tmpdir(), 'booklib-rules-')); }

// ─── listAvailable ───────────────────────────────────────────────────────────

test('listAvailable returns entries for each language directory', () => {
  const result = listAvailable();
  assert.ok(Array.isArray(result));
  assert.ok(result.length > 0);
  const langs = result.map(r => r.lang);
  assert.ok(langs.includes('python'));
  assert.ok(langs.includes('common'));
});

test('listAvailable includes files array for each lang', () => {
  const result = listAvailable();
  for (const item of result) {
    assert.ok(Array.isArray(item.files));
    assert.ok(item.files.every(f => f.endsWith('.md')));
  }
});

test('listAvailable sets installedProject false when no .cursor/rules', () => {
  const cwd = tmp();
  const home = tmp();
  const result = listAvailable(cwd, home);
  for (const item of result) {
    assert.equal(item.installedProject, false);
  }
  rmSync(cwd, { recursive: true });
  rmSync(home, { recursive: true });
});

test('listAvailable sets installedProject true when mdc file found', () => {
  const cwd = tmp();
  const home = tmp();
  mkdirSync(join(cwd, '.cursor', 'rules'), { recursive: true });
  writeFileSync(join(cwd, '.cursor', 'rules', 'python-effective-python.mdc'), '# test');
  const result = listAvailable(cwd, home);
  const py = result.find(r => r.lang === 'python');
  assert.ok(py);
  assert.equal(py.installedProject, true);
  rmSync(cwd, { recursive: true });
  rmSync(home, { recursive: true });
});

test('listAvailable sets installedGlobal true when marker found in CLAUDE.md', () => {
  const cwd = tmp();
  const home = tmp();
  mkdirSync(join(home, '.claude'), { recursive: true });
  writeFileSync(
    join(home, '.claude', 'CLAUDE.md'),
    '<!-- booklib-rules-python-start -->\nsome content\n<!-- booklib-rules-python-end -->\n',
  );
  const result = listAvailable(cwd, home);
  const py = result.find(r => r.lang === 'python');
  assert.ok(py);
  assert.equal(py.installedGlobal, true);
  rmSync(cwd, { recursive: true });
  rmSync(home, { recursive: true });
});

// ─── installRule (project) ───────────────────────────────────────────────────

test('installRule writes mdc file to .cursor/rules/', () => {
  const cwd = tmp();
  const home = tmp();
  const written = installRule('python', { cwd, home });
  assert.ok(written.length > 0);
  const destFile = join(cwd, '.cursor', 'rules', 'python-effective-python.mdc');
  assert.ok(existsSync(destFile));
  rmSync(cwd, { recursive: true });
  rmSync(home, { recursive: true });
});

test('installRule adds MDC frontmatter when absent', () => {
  const cwd = tmp();
  const home = tmp();
  installRule('python', { cwd, home });
  const destFile = join(cwd, '.cursor', 'rules', 'python-effective-python.mdc');
  const content = readFileSync(destFile, 'utf8');
  assert.ok(content.startsWith('---'));
  assert.ok(content.includes('alwaysApply: false'));
  rmSync(cwd, { recursive: true });
  rmSync(home, { recursive: true });
});

test('installRule preserves existing frontmatter', () => {
  const cwd = tmp();
  const home = tmp();
  installRule('python', { cwd, home });
  const destFile = join(cwd, '.cursor', 'rules', 'python-effective-python.mdc');
  const content = readFileSync(destFile, 'utf8');
  const frontmatterCount = (content.match(/^---/gm) || []).length;
  assert.ok(frontmatterCount <= 2, `Too many frontmatter markers: ${frontmatterCount}`);
  rmSync(cwd, { recursive: true });
  rmSync(home, { recursive: true });
});

test('installRule throws for unknown lang', () => {
  const cwd = tmp();
  const home = tmp();
  assert.throws(
    () => installRule('scala', { cwd, home }),
    /Unknown language/,
  );
  rmSync(cwd, { recursive: true });
  rmSync(home, { recursive: true });
});

// ─── installRule (global) ────────────────────────────────────────────────────

test('installRule global appends section to CLAUDE.md', () => {
  const cwd = tmp();
  const home = tmp();
  mkdirSync(join(home, '.claude'), { recursive: true });
  installRule('python', { cwd, home, global: true });
  const content = readFileSync(join(home, '.claude', 'CLAUDE.md'), 'utf8');
  assert.ok(content.includes('<!-- booklib-rules-python-start -->'));
  assert.ok(content.includes('<!-- booklib-rules-python-end -->'));
  rmSync(cwd, { recursive: true });
  rmSync(home, { recursive: true });
});

test('installRule global is idempotent — replaces existing section', () => {
  const cwd = tmp();
  const home = tmp();
  mkdirSync(join(home, '.claude'), { recursive: true });
  installRule('python', { cwd, home, global: true });
  installRule('python', { cwd, home, global: true });
  const content = readFileSync(join(home, '.claude', 'CLAUDE.md'), 'utf8');
  const startCount = (content.match(/<!-- booklib-rules-python-start -->/g) || []).length;
  assert.equal(startCount, 1);
  rmSync(cwd, { recursive: true });
  rmSync(home, { recursive: true });
});

test('installRule global creates CLAUDE.md if absent', () => {
  const cwd = tmp();
  const home = tmp();
  mkdirSync(join(home, '.claude'), { recursive: true });
  installRule('python', { cwd, home, global: true });
  assert.ok(existsSync(join(home, '.claude', 'CLAUDE.md')));
  rmSync(cwd, { recursive: true });
  rmSync(home, { recursive: true });
});

test('installRule global preserves existing CLAUDE.md content', () => {
  const cwd = tmp();
  const home = tmp();
  mkdirSync(join(home, '.claude'), { recursive: true });
  writeFileSync(join(home, '.claude', 'CLAUDE.md'), '# My existing rules\n\nDo not delete me.\n');
  installRule('python', { cwd, home, global: true });
  const content = readFileSync(join(home, '.claude', 'CLAUDE.md'), 'utf8');
  assert.ok(content.includes('# My existing rules'));
  assert.ok(content.includes('Do not delete me.'));
  assert.ok(content.includes('<!-- booklib-rules-python-start -->'));
  rmSync(cwd, { recursive: true });
  rmSync(home, { recursive: true });
});

// ─── status ──────────────────────────────────────────────────────────────────

test('status returns empty when no rules installed', () => {
  const cwd = tmp();
  const home = tmp();
  const result = status(cwd, home);
  assert.deepEqual(result.cursor, []);
  assert.deepEqual(result.global, []);
  assert.equal(result.totalBytes, 0);
  rmSync(cwd, { recursive: true });
  rmSync(home, { recursive: true });
});

test('status lists cursor mdc files with sizes', () => {
  const cwd = tmp();
  const home = tmp();
  mkdirSync(join(cwd, '.cursor', 'rules'), { recursive: true });
  writeFileSync(join(cwd, '.cursor', 'rules', 'python-effective-python.mdc'), 'hello world');
  const result = status(cwd, home);
  assert.equal(result.cursor.length, 1);
  assert.ok(result.cursor[0].path.endsWith('python-effective-python.mdc'));
  assert.ok(result.cursor[0].sizeBytes > 0);
  rmSync(cwd, { recursive: true });
  rmSync(home, { recursive: true });
});

test('status lists global sections with sizes', () => {
  const cwd = tmp();
  const home = tmp();
  mkdirSync(join(home, '.claude'), { recursive: true });
  writeFileSync(
    join(home, '.claude', 'CLAUDE.md'),
    '<!-- booklib-rules-python-start -->\npython rules here\n<!-- booklib-rules-python-end -->\n',
  );
  const result = status(cwd, home);
  assert.equal(result.global.length, 1);
  assert.equal(result.global[0].lang, 'python');
  assert.ok(result.global[0].sizeBytes > 0);
  rmSync(cwd, { recursive: true });
  rmSync(home, { recursive: true });
});

test('status totalBytes is sum of cursor and global', () => {
  const cwd = tmp();
  const home = tmp();
  mkdirSync(join(cwd, '.cursor', 'rules'), { recursive: true });
  writeFileSync(join(cwd, '.cursor', 'rules', 'python-effective-python.mdc'), 'aaa');
  mkdirSync(join(home, '.claude'), { recursive: true });
  writeFileSync(
    join(home, '.claude', 'CLAUDE.md'),
    '<!-- booklib-rules-common-start -->\nbbb\n<!-- booklib-rules-common-end -->\n',
  );
  const result = status(cwd, home);
  const expected = result.cursor.reduce((s, c) => s + c.sizeBytes, 0) +
    result.global.reduce((s, g) => s + g.sizeBytes, 0);
  assert.equal(result.totalBytes, expected);
  rmSync(cwd, { recursive: true });
  rmSync(home, { recursive: true });
});
