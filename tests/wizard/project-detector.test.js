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

test('detects Next.js from subdirectory package.json (monorepo)', () => {
  const dir = tmp();
  mkdirSync(join(dir, 'frontend'));
  writeFileSync(join(dir, 'frontend', 'package.json'), JSON.stringify({
    dependencies: { next: '^14', react: '^18' }
  }));
  writeFileSync(join(dir, 'frontend', 'index.js'), '');
  const result = detect(dir);
  assert.ok(result.frameworks.includes('Next.js'), `Expected Next.js in frameworks, got: ${result.frameworks}`);
  assert.ok(result.frameworks.includes('React'), `Expected React in frameworks, got: ${result.frameworks}`);
});

test('detects FastAPI from subdirectory requirements.txt (monorepo)', () => {
  const dir = tmp();
  mkdirSync(join(dir, 'scraper'));
  writeFileSync(join(dir, 'scraper', 'requirements.txt'), 'fastapi==0.100\nuvicorn');
  const result = detect(dir);
  assert.ok(result.languages.includes('python'), `Expected python in languages, got: ${result.languages}`);
  assert.ok(result.frameworks.includes('FastAPI'), `Expected FastAPI in frameworks, got: ${result.frameworks}`);
  assert.ok(result.signals.includes('scraper/requirements.txt'), `Expected scraper/requirements.txt in signals, got: ${result.signals}`);
});

test('detects frameworks from both root and subdirectory (monorepo)', () => {
  const dir = tmp();
  // Root has Express
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    dependencies: { express: '^4' }
  }));
  writeFileSync(join(dir, 'server.js'), '');
  // Subdirectory has Next.js
  mkdirSync(join(dir, 'frontend'));
  writeFileSync(join(dir, 'frontend', 'package.json'), JSON.stringify({
    dependencies: { next: '^14', react: '^18' }
  }));
  // Subdirectory has FastAPI
  mkdirSync(join(dir, 'scraper'));
  writeFileSync(join(dir, 'scraper', 'requirements.txt'), 'fastapi==0.100\nuvicorn');
  const result = detect(dir);
  assert.ok(result.frameworks.includes('Express'), `Expected Express, got: ${result.frameworks}`);
  assert.ok(result.frameworks.includes('Next.js'), `Expected Next.js, got: ${result.frameworks}`);
  assert.ok(result.frameworks.includes('FastAPI'), `Expected FastAPI, got: ${result.frameworks}`);
});

test('returns empty for empty dir', () => {
  const dir = tmp();
  const result = detect(dir);
  assert.deepEqual(result.languages, []);
  rmSync(dir, { recursive: true });
});
