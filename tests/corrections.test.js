import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  levelFromMentions, cosine, loadCorrections, listCorrections,
  removeCorrection, rebuildLearnedSection, MARKER_START, MARKER_END,
  addCorrection,
} from '../lib/engine/corrections.js';

function tmpHome() {
  const dir = mkdtempSync(join(tmpdir(), 'booklib-test-'));
  mkdirSync(join(dir, '.booklib'), { recursive: true });
  mkdirSync(join(dir, '.claude'), { recursive: true });
  return dir;
}

function seedCorrections(home, entries) {
  const p = join(home, '.booklib', 'corrections.jsonl');
  writeFileSync(p, entries.map(e => JSON.stringify(e)).join('\n') + '\n');
}

test('levelFromMentions: 1→1, 3→2, 5→3, 10→4', () => {
  assert.equal(levelFromMentions(1), 1);
  assert.equal(levelFromMentions(2), 1);
  assert.equal(levelFromMentions(3), 2);
  assert.equal(levelFromMentions(4), 2);
  assert.equal(levelFromMentions(5), 3);
  assert.equal(levelFromMentions(9), 3);
  assert.equal(levelFromMentions(10), 4);
  assert.equal(levelFromMentions(99), 4);
});

test('cosine: identical vectors → 1.0', () => {
  const v = [0.5, 0.5, 0.5, 0.5];
  assert.ok(Math.abs(cosine(v, v) - 1.0) < 1e-9);
});

test('cosine: orthogonal vectors → 0.0', () => {
  const a = [1, 0];
  const b = [0, 1];
  assert.ok(Math.abs(cosine(a, b)) < 1e-9);
});

test('loadCorrections: returns [] when file missing', () => {
  const home = tmpHome();
  assert.deepEqual(loadCorrections(home), []);
});

test('loadCorrections: skips corrupt lines, preserves valid ones', () => {
  const home = tmpHome();
  const valid = { id: 'abc', text: 'use const', mentions: 1, level: 1,
                  sessions: [], firstSeen: '', lastSeen: '' };
  // One corrupt line mixed with one valid line
  writeFileSync(
    join(home, '.booklib', 'corrections.jsonl'),
    'not json\n' + JSON.stringify(valid) + '\n'
  );
  const result = loadCorrections(home);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'abc');
});

test('loadCorrections: parses valid JSONL', () => {
  const home = tmpHome();
  const entry = { id: 'abc123', text: 'use const', mentions: 2, level: 1,
                   sessions: [], firstSeen: '2026-01-01', lastSeen: '2026-01-01' };
  seedCorrections(home, [entry]);
  const result = loadCorrections(home);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'abc123');
});

test('listCorrections: sorted by mentions descending', () => {
  const home = tmpHome();
  const a = { id: 'a', text: 'A', mentions: 1, level: 1, sessions: [], firstSeen: '', lastSeen: '' };
  const b = { id: 'b', text: 'B', mentions: 9, level: 3, sessions: [], firstSeen: '', lastSeen: '' };
  const c = { id: 'c', text: 'C', mentions: 4, level: 2, sessions: [], firstSeen: '', lastSeen: '' };
  seedCorrections(home, [a, b, c]);
  const sorted = listCorrections(home);
  assert.equal(sorted[0].id, 'b');
  assert.equal(sorted[1].id, 'c');
  assert.equal(sorted[2].id, 'a');
});

test('removeCorrection: returns removed entry', () => {
  const home = tmpHome();
  const entry = { id: 'xyz', text: 'no var', mentions: 2, level: 1,
                   sessions: [], firstSeen: '', lastSeen: '' };
  seedCorrections(home, [entry]);
  const removed = removeCorrection('xyz', home);
  assert.equal(removed.id, 'xyz');
  assert.equal(loadCorrections(home).length, 0);
});

test('removeCorrection: returns null for unknown id', () => {
  const home = tmpHome();
  seedCorrections(home, []);
  assert.equal(removeCorrection('nope', home), null);
});

test('rebuildLearnedSection: writes section with level-3+ corrections', () => {
  const home = tmpHome();
  const entries = [
    { id: 'a', text: 'always use const', mentions: 5, level: 3, sessions: [], firstSeen: '', lastSeen: '' },
    { id: 'b', text: 'no magic numbers', mentions: 1, level: 1, sessions: [], firstSeen: '', lastSeen: '' },
  ];
  seedCorrections(home, entries);
  rebuildLearnedSection(home);
  const content = readFileSync(join(home, '.claude', 'CLAUDE.md'), 'utf8');
  assert.ok(content.includes(MARKER_START));
  assert.ok(content.includes('always use const'));
  assert.ok(!content.includes('no magic numbers'));
  assert.ok(content.includes(MARKER_END));
});

test('rebuildLearnedSection: replaces existing section idempotently', () => {
  const home = tmpHome();
  const entries = [
    { id: 'a', text: 'use const', mentions: 5, level: 3, sessions: [], firstSeen: '', lastSeen: '' },
  ];
  seedCorrections(home, entries);
  rebuildLearnedSection(home);
  rebuildLearnedSection(home);
  const content = readFileSync(join(home, '.claude', 'CLAUDE.md'), 'utf8');
  const count = (content.match(/booklib-learned-start/g) || []).length;
  assert.equal(count, 1);
});

test('rebuildLearnedSection: removes section when no level-3+ corrections', () => {
  const home = tmpHome();
  seedCorrections(home, [
    { id: 'a', text: 'use const', mentions: 5, level: 3, sessions: [], firstSeen: '', lastSeen: '' },
  ]);
  rebuildLearnedSection(home);
  seedCorrections(home, [
    { id: 'a', text: 'use const', mentions: 1, level: 1, sessions: [], firstSeen: '', lastSeen: '' },
  ]);
  rebuildLearnedSection(home);
  const content = readFileSync(join(home, '.claude', 'CLAUDE.md'), 'utf8');
  assert.ok(!content.includes(MARKER_START));
});

test('rebuildLearnedSection: preserves existing CLAUDE.md content', () => {
  const home = tmpHome();
  const existing = '# My existing rules\n\nSome content here.\n';
  writeFileSync(join(home, '.claude', 'CLAUDE.md'), existing);
  seedCorrections(home, [
    { id: 'a', text: 'use const', mentions: 5, level: 3, sessions: [], firstSeen: '', lastSeen: '' },
  ]);
  rebuildLearnedSection(home);
  const content = readFileSync(join(home, '.claude', 'CLAUDE.md'), 'utf8');
  assert.ok(content.includes('# My existing rules'));
  assert.ok(content.includes(MARKER_START));
});

// ── addCorrection tests (use injected embedFn to avoid loading real model) ────

function makeEmbedFn(map) {
  return async (text) => {
    if (map[text]) return map[text];
    const v = new Array(8).fill(0);
    v[text.length % 8] = 1;
    return v;
  };
}

test('addCorrection: new correction stored at level 1', async () => {
  const home = tmpHome();
  const embedFn = makeEmbedFn({});
  const result = await addCorrection('use const not var', home, embedFn);
  assert.equal(result.mentions, 1);
  assert.equal(result.level, 1);
  assert.equal(result.wasExisting, false);
  assert.equal(loadCorrections(home).length, 1);
});

test('addCorrection: identical text increments existing', async () => {
  const home = tmpHome();
  const vec = [1, 0, 0, 0, 0, 0, 0, 0];
  const embedFn = makeEmbedFn({ 'use const': vec, 'use const not var': vec });
  await addCorrection('use const', home, embedFn);
  const result = await addCorrection('use const not var', home, embedFn);
  assert.equal(result.wasExisting, true);
  assert.equal(result.mentions, 2);
  assert.equal(loadCorrections(home).length, 1);
});

test('addCorrection: different text creates new entry', async () => {
  const home = tmpHome();
  const embedFn = makeEmbedFn({
    'use const': [1, 0, 0, 0, 0, 0, 0, 0],
    'no magic numbers': [0, 1, 0, 0, 0, 0, 0, 0],
  });
  await addCorrection('use const', home, embedFn);
  await addCorrection('no magic numbers', home, embedFn);
  assert.equal(loadCorrections(home).length, 2);
});

test('addCorrection: reaching level 3 triggers CLAUDE.md rebuild', async () => {
  const home = tmpHome();
  const vec = [1, 0, 0, 0, 0, 0, 0, 0];
  const embedFn = makeEmbedFn({ 'use const': vec });
  seedCorrections(home, [{
    id: 'test1', text: 'use const', mentions: 4, level: 2,
    sessions: [], firstSeen: '', lastSeen: '',
  }]);
  await addCorrection('use const', home, embedFn);
  const content = readFileSync(join(home, '.claude', 'CLAUDE.md'), 'utf8');
  assert.ok(content.includes(MARKER_START));
  assert.ok(content.includes('use const'));
});

test('addCorrection: does not expose embedding field in return value', async () => {
  const home = tmpHome();
  const embedFn = makeEmbedFn({ 'test rule': [1, 0, 0, 0, 0, 0, 0, 0] });
  const result = await addCorrection('test rule', home, embedFn);
  assert.ok(!('embedding' in result));
});
