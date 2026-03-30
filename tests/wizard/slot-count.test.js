// tests/wizard/slot-count.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { countInstalledSlots, installBundledSkill } from '../../lib/skill-fetcher.js';

test('countInstalledSlots counts only .booklib-marked dirs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'booklib-slots-'));
  // marked dir
  mkdirSync(join(dir, 'skill-a'), { recursive: true });
  writeFileSync(join(dir, 'skill-a', '.booklib'), '');
  // unmarked dir (user-managed)
  mkdirSync(join(dir, 'skill-b'), { recursive: true });

  assert.equal(countInstalledSlots(dir), 1);
  rmSync(dir, { recursive: true });
});

test('countInstalledSlots returns 0 for empty dir', () => {
  const dir = mkdtempSync(join(tmpdir(), 'booklib-slots-'));
  assert.equal(countInstalledSlots(dir), 0);
  rmSync(dir, { recursive: true });
});
