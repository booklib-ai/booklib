// tests/wizard/integration-detector.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectIntegrations } from '../../lib/wizard/integration-detector.js';

test('detects ruflo from config file in cwd', () => {
  const dir = mkdtempSync(join(tmpdir(), 'booklib-int-'));
  writeFileSync(join(dir, 'ruflo.config.json'), '{}');
  const result = detectIntegrations({ cwd: dir, home: dir });
  assert.equal(result.ruflo, true);
  rmSync(dir, { recursive: true });
});

test('detects superpowers from plugins dir', () => {
  const dir = mkdtempSync(join(tmpdir(), 'booklib-int-'));
  mkdirSync(join(dir, '.claude', 'plugins', 'superpowers'), { recursive: true });
  const result = detectIntegrations({ cwd: dir, home: dir });
  assert.equal(result.superpowers, true);
  rmSync(dir, { recursive: true });
});

test('returns false for empty dir', () => {
  const dir = mkdtempSync(join(tmpdir(), 'booklib-int-'));
  const result = detectIntegrations({ cwd: dir, home: dir });
  assert.equal(result.superpowers, false);
  assert.equal(result.ruflo, false);
  rmSync(dir, { recursive: true });
});
