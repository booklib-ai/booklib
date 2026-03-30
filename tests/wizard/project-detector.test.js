// tests/wizard/project-detector.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detect } from '../../lib/wizard/project-detector.js';

function tmp() { return mkdtempSync(join(tmpdir(), 'booklib-detect-')); }

test('detects python from pyproject.toml', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'pyproject.toml'), '[tool.poetry]\nname = "app"');
  const result = detect(dir);
  assert.ok(result.languages.includes('python'));
  rmSync(dir, { recursive: true });
});

test('detects kotlin from .kt file', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'Main.kt'), 'fun main() {}');
  const result = detect(dir);
  assert.ok(result.languages.includes('kotlin'));
  rmSync(dir, { recursive: true });
});

test('detects typescript from package.json dep', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    dependencies: { typescript: '^5' }
  }));
  writeFileSync(join(dir, 'index.ts'), '');
  const result = detect(dir);
  assert.ok(result.languages.includes('typescript'));
  rmSync(dir, { recursive: true });
});

test('detects fastapi framework', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'requirements.txt'), 'fastapi==0.100\nuvicorn');
  const result = detect(dir);
  assert.ok(result.frameworks.includes('FastAPI'));
  rmSync(dir, { recursive: true });
});

test('returns empty for empty dir', () => {
  const dir = tmp();
  const result = detect(dir);
  assert.deepEqual(result.languages, []);
  rmSync(dir, { recursive: true });
});
