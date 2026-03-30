// tests/doctor/usage-tracker.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { appendUsage, readUsage, summarize } from '../../lib/doctor/usage-tracker.js';

function tmp() { return mkdtempSync(join(tmpdir(), 'booklib-doctor-')); }

test('readUsage returns [] when file does not exist', () => {
  const dir = tmp();
  const result = readUsage(join(dir, 'usage.json'));
  assert.deepEqual(result, []);
  rmSync(dir, { recursive: true });
});

test('appendUsage creates file and adds entry', () => {
  const dir = tmp();
  const file = join(dir, 'usage.json');
  appendUsage('effective-python', file);
  const entries = readUsage(file);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].skill, 'effective-python');
  assert.ok(typeof entries[0].timestamp === 'string');
  rmSync(dir, { recursive: true });
});

test('appendUsage accumulates multiple entries', () => {
  const dir = tmp();
  const file = join(dir, 'usage.json');
  appendUsage('effective-python', file);
  appendUsage('effective-python', file);
  appendUsage('clean-code-reviewer', file);
  const entries = readUsage(file);
  assert.equal(entries.length, 3);
  rmSync(dir, { recursive: true });
});

test('summarize returns entry for every installed skill', () => {
  const entries = [
    { skill: 'effective-python', timestamp: new Date().toISOString() },
  ];
  const result = summarize(entries, ['effective-python', 'design-patterns']);
  assert.equal(result.length, 2);
  const names = result.map(r => r.name);
  assert.ok(names.includes('effective-python'));
  assert.ok(names.includes('design-patterns'));
});

test('summarize counts uses correctly', () => {
  const now = new Date().toISOString();
  const entries = [
    { skill: 'effective-python', timestamp: now },
    { skill: 'effective-python', timestamp: now },
    { skill: 'clean-code-reviewer', timestamp: now },
  ];
  const result = summarize(entries, ['effective-python', 'clean-code-reviewer']);
  const py = result.find(r => r.name === 'effective-python');
  const cc = result.find(r => r.name === 'clean-code-reviewer');
  assert.equal(py.uses, 2);
  assert.equal(cc.uses, 1);
});

test('summarize sets lastUsed to most recent timestamp', () => {
  const old    = new Date('2026-01-01T00:00:00Z').toISOString();
  const recent = new Date('2026-03-28T00:00:00Z').toISOString();
  const entries = [
    { skill: 'effective-python', timestamp: old },
    { skill: 'effective-python', timestamp: recent },
  ];
  const result = summarize(entries, ['effective-python']);
  const py = result.find(r => r.name === 'effective-python');
  assert.equal(py.lastUsed.toISOString(), recent);
});

test('summarize sets lastUsed null for never-used skill', () => {
  const result = summarize([], ['design-patterns']);
  assert.equal(result[0].lastUsed, null);
  assert.equal(result[0].uses, 0);
});

test('summarize flags 0-use skill installed >30 days ago as remove', () => {
  const installDate = new Date(Date.now() - 47 * 24 * 60 * 60 * 1000);
  const result = summarize([], ['design-patterns'], { 'design-patterns': installDate });
  assert.equal(result[0].suggestion, 'remove');
});

test('summarize flags <2 uses in 60 days as low-activity', () => {
  const oldDate = new Date(Date.now() - 62 * 24 * 60 * 60 * 1000).toISOString();
  const entries = [{ skill: 'effective-java', timestamp: oldDate }];
  const result = summarize(entries, ['effective-java']);
  assert.equal(result[0].suggestion, 'low-activity');
});

test('summarize healthy skill has suggestion null', () => {
  const entries = Array.from({ length: 5 }, () => ({
    skill: 'effective-python',
    timestamp: new Date().toISOString(),
  }));
  const result = summarize(entries, ['effective-python']);
  assert.equal(result[0].suggestion, null);
});

test('appendUsage creates nested directories if absent', () => {
  const dir = tmp();
  const file = join(dir, 'deep', 'nested', 'usage.json');
  appendUsage('effective-python', file);
  const entries = readUsage(file);
  assert.equal(entries.length, 1);
  rmSync(dir, { recursive: true });
});

test('summarize sorts healthy skills before suggestions', () => {
  const now = new Date().toISOString();
  const oldDate = new Date(Date.now() - 62 * 24 * 60 * 60 * 1000).toISOString();
  // design-patterns installed 20 days ago (established, no recent use → low-activity)
  const installDates = { 'design-patterns': new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) };
  const entries = [
    { skill: 'effective-python', timestamp: now },
    { skill: 'effective-python', timestamp: now },
    { skill: 'effective-python', timestamp: now },
    { skill: 'effective-java', timestamp: oldDate },
  ];
  const result = summarize(entries, ['effective-python', 'effective-java', 'design-patterns'], installDates);
  // healthy first
  assert.equal(result[0].suggestion, null);
  assert.equal(result[0].name, 'effective-python');
  // suggestions after
  assert.ok(result.slice(1).every(r => r.suggestion !== null));
});

test('readUsage returns [] for corrupt file', () => {
  const dir = tmp();
  const file = join(dir, 'usage.json');
  writeFileSync(file, 'not valid json{{{');
  const result = readUsage(file);
  assert.deepEqual(result, []);
  rmSync(dir, { recursive: true });
});
