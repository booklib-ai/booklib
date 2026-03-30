// tests/doctor/hook-installer.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { installTrackingHook } from '../../lib/doctor/hook-installer.js';

function tmp() { return mkdtempSync(join(tmpdir(), 'booklib-hook-')); }

test('installTrackingHook writes track-usage.mjs', () => {
  const home = tmp();
  installTrackingHook(home);
  const scriptPath = join(home, '.booklib', 'track-usage.mjs');
  assert.ok(existsSync(scriptPath));
  const content = readFileSync(scriptPath, 'utf8');
  assert.ok(content.includes('usage.json'));
  assert.ok(content.includes('skill'));
  rmSync(home, { recursive: true });
});

test('installTrackingHook creates settings.json with Skill hook', () => {
  const home = tmp();
  mkdirSync(join(home, '.claude'), { recursive: true });
  installTrackingHook(home);
  const settings = JSON.parse(readFileSync(join(home, '.claude', 'settings.json'), 'utf8'));
  assert.ok(Array.isArray(settings.hooks?.PreToolUse));
  const entry = settings.hooks.PreToolUse.find(e => e.matcher === 'Skill');
  assert.ok(entry);
  assert.ok(entry.hooks[0].command.includes('track-usage.mjs'));
  rmSync(home, { recursive: true });
});

test('installTrackingHook preserves existing hooks', () => {
  const home = tmp();
  mkdirSync(join(home, '.claude'), { recursive: true });
  const settingsPath = join(home, '.claude', 'settings.json');
  writeFileSync(settingsPath, JSON.stringify({
    hooks: {
      PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo bash' }] }]
    }
  }, null, 2));
  installTrackingHook(home);
  const updated = JSON.parse(readFileSync(settingsPath, 'utf8'));
  assert.ok(updated.hooks.PreToolUse.find(e => e.matcher === 'Bash'));
  assert.ok(updated.hooks.PreToolUse.find(e => e.matcher === 'Skill'));
  rmSync(home, { recursive: true });
});

test('installTrackingHook reports alreadyInstalled on second call', () => {
  const home = tmp();
  installTrackingHook(home);
  const result = installTrackingHook(home);
  assert.equal(result.alreadyInstalled, true);
  rmSync(home, { recursive: true });
});

test('installTrackingHook returns scriptPath and settingsPath', () => {
  const home = tmp();
  const result = installTrackingHook(home);
  assert.ok(result.scriptPath.endsWith('track-usage.mjs'));
  assert.ok(result.settingsPath.endsWith('settings.json'));
  rmSync(home, { recursive: true });
});
