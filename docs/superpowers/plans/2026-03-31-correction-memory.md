# Correction Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `booklib correction add/list/remove` commands that store agent corrections globally and progressively inject them into `~/.claude/CLAUDE.md` as they repeat.

**Architecture:** One new module `lib/engine/corrections.js` handles all storage and CLAUDE.md injection. `bin/booklib.js` gets a new `case 'correction':` dispatcher. Deduplication uses semantic similarity via the same HuggingFace embedding model already in the codebase.

**Tech Stack:** Node.js ESM, `@huggingface/transformers` (Xenova/all-MiniLM-L6-v2), `node:fs`, `node:test` for tests.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `lib/engine/corrections.js` | Create | All corrections logic: load/save JSONL, semantic dedup, level promotion, CLAUDE.md injection |
| `tests/corrections.test.js` | Create | Unit + integration tests for corrections.js |
| `bin/booklib.js` | Modify (add `case 'correction':`) | CLI dispatcher for add/list/remove subcommands |

---

### Task 1: Pure functions and file I/O in corrections.js

**Files:**
- Create: `lib/engine/corrections.js`
- Create: `tests/corrections.test.js`

- [ ] **Step 1: Write failing tests for pure functions and file I/O**

Create `tests/corrections.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  levelFromMentions, cosine, loadCorrections, listCorrections,
  removeCorrection, rebuildLearnedSection,
} from '../lib/engine/corrections.js';

const MARKER_START = '<!-- booklib-learned-start -->';
const MARKER_END   = '<!-- booklib-learned-end -->';

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

test('loadCorrections: returns [] and warns on corrupt file', () => {
  const home = tmpHome();
  writeFileSync(join(home, '.booklib', 'corrections.jsonl'), 'not json\n');
  assert.deepEqual(loadCorrections(home), []);
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
  rebuildLearnedSection(home); // second call must not duplicate
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
  // Now remove all level-3+ corrections
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
node --test tests/corrections.test.js 2>&1 | head -20
```

Expected: `Error [ERR_MODULE_NOT_FOUND]` — `corrections.js` does not exist yet.

- [ ] **Step 3: Create lib/engine/corrections.js with pure functions and file I/O**

```js
// lib/engine/corrections.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from '@huggingface/transformers';

// ── Constants ────────────────────────────────────────────────────────────────

export const LEVEL_THRESHOLDS = [
  { level: 4, min: 10 },
  { level: 3, min: 5 },
  { level: 2, min: 3 },
  { level: 1, min: 1 },
];

const DEDUP_THRESHOLD = 0.85;
const MAX_INJECTED    = 20;

export const MARKER_START = '<!-- booklib-learned-start -->';
export const MARKER_END   = '<!-- booklib-learned-end -->';

// ── Embedding model (lazy-loaded, module-level singleton) ────────────────────

let _extractor = null;

async function _getEmbedding(text) {
  if (!_extractor) {
    _extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  const output = await _extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

// ── Pure functions ────────────────────────────────────────────────────────────

export function levelFromMentions(n) {
  for (const { level, min } of LEVEL_THRESHOLDS) {
    if (n >= min) return level;
  }
  return 1;
}

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

function _generateId() {
  return Math.random().toString(16).slice(2, 8);
}

function _escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── File paths ────────────────────────────────────────────────────────────────

function _correctionsPath(home) {
  return path.join(home, '.booklib', 'corrections.jsonl');
}

function _claudeMdPath(home) {
  return path.join(home, '.claude', 'CLAUDE.md');
}

// ── Storage ───────────────────────────────────────────────────────────────────

export function loadCorrections(home = os.homedir()) {
  const p = _correctionsPath(home);
  if (!fs.existsSync(p)) return [];
  try {
    return fs.readFileSync(p, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
  } catch {
    process.stderr.write('Warning: corrections.jsonl is corrupt, treating as empty.\n');
    return [];
  }
}

function _saveCorrections(corrections, home) {
  const p = _correctionsPath(home);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const lines = corrections.map(c => JSON.stringify(c)).join('\n');
  fs.writeFileSync(p, corrections.length ? lines + '\n' : '');
}

// ── CLAUDE.md injection ────────────────────────────────────────────────────────

export function rebuildLearnedSection(home = os.homedir()) {
  const corrections = loadCorrections(home);
  const active = corrections
    .filter(c => c.level >= 3)
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, MAX_INJECTED);

  const claudeFile = _claudeMdPath(home);
  fs.mkdirSync(path.dirname(claudeFile), { recursive: true });

  let existing = '';
  try { existing = fs.readFileSync(claudeFile, 'utf8'); } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }

  if (active.length === 0) {
    const re = new RegExp(
      `\\n?${_escapeRegex(MARKER_START)}[\\s\\S]*?${_escapeRegex(MARKER_END)}\\n?`
    );
    const updated = existing.replace(re, '').trimEnd();
    fs.writeFileSync(claudeFile, updated ? updated + '\n' : '');
    return;
  }

  const bullets = active.map(c => `- ${c.text.slice(0, 120)}`).join('\n');
  const section = [
    MARKER_START,
    '## Learned Corrections (BookLib)',
    '',
    '> When the user corrects your approach, run: booklib correction add "brief rule"',
    '',
    bullets,
    '',
    MARKER_END,
  ].join('\n');

  const re = new RegExp(
    `${_escapeRegex(MARKER_START)}[\\s\\S]*?${_escapeRegex(MARKER_END)}`
  );
  const updated = existing.includes(MARKER_START)
    ? existing.replace(re, section)
    : (existing.trimEnd() ? `${existing.trimEnd()}\n\n${section}\n` : `${section}\n`);

  fs.writeFileSync(claudeFile, updated);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function listCorrections(home = os.homedir()) {
  return loadCorrections(home).sort((a, b) => b.mentions - a.mentions);
}

export function removeCorrection(id, home = os.homedir()) {
  const corrections = loadCorrections(home);
  const idx = corrections.findIndex(c => c.id === id);
  if (idx === -1) return null;
  const [removed] = corrections.splice(idx, 1);
  _saveCorrections(corrections, home);
  rebuildLearnedSection(home);
  return removed;
}

export async function addCorrection(text, home = os.homedir(), embedFn = _getEmbedding) {
  const corrections = loadCorrections(home);
  const now = new Date().toISOString();
  const newVec = await embedFn(text);

  for (const c of corrections) {
    const existVec = await embedFn(c.text);
    const sim = cosine(newVec, existVec);
    if (sim >= DEDUP_THRESHOLD) {
      const oldLevel = c.level;
      c.mentions += 1;
      c.level = levelFromMentions(c.mentions);
      c.lastSeen = now;
      c.sessions.push(now);
      _saveCorrections(corrections, home);
      if (c.level >= 3 && c.level !== oldLevel) rebuildLearnedSection(home);
      return { ...c, wasExisting: true };
    }
  }

  const entry = {
    id: _generateId(),
    text,
    mentions: 1,
    level: levelFromMentions(1),
    sessions: [now],
    firstSeen: now,
    lastSeen: now,
  };
  corrections.push(entry);
  _saveCorrections(corrections, home);
  return { ...entry, wasExisting: false };
}
```

- [ ] **Step 4: Run tests — all should pass**

```bash
node --test tests/corrections.test.js 2>&1
```

Expected output:
```
✔ levelFromMentions: 1→1, 3→2, 5→3, 10→4
✔ cosine: identical vectors → 1.0
✔ cosine: orthogonal vectors → 0.0
✔ loadCorrections: returns [] when file missing
✔ loadCorrections: returns [] and warns on corrupt file
✔ loadCorrections: parses valid JSONL
✔ listCorrections: sorted by mentions descending
✔ removeCorrection: returns removed entry
✔ removeCorrection: returns null for unknown id
✔ rebuildLearnedSection: writes section with level-3+ corrections
✔ rebuildLearnedSection: replaces existing section idempotently
✔ rebuildLearnedSection: removes section when no level-3+ corrections
✔ rebuildLearnedSection: preserves existing CLAUDE.md content
ℹ tests 13
ℹ pass 13
ℹ fail 0
```

- [ ] **Step 5: Commit**

```bash
git add lib/engine/corrections.js tests/corrections.test.js
git commit -m "feat(corrections): CorrectionsManager — storage, dedup, CLAUDE.md injection"
```

---

### Task 2: addCorrection with semantic dedup (integration test)

**Files:**
- Modify: `tests/corrections.test.js` (add dedup tests using injected embedFn)

- [ ] **Step 1: Write failing tests for addCorrection**

Append to `tests/corrections.test.js`:

```js
// ── addCorrection tests (use injected embedFn to avoid loading real model) ────

function makeEmbedFn(map) {
  // map: { [text]: number[] } — returns fixed vectors for known strings
  // unknown strings get a random-ish vector derived from their length
  return async (text) => {
    if (map[text]) return map[text];
    // fallback: unique vector per text (orthogonal enough for testing)
    const v = new Array(8).fill(0);
    v[text.length % 8] = 1;
    return v;
  };
}

import { addCorrection } from '../lib/engine/corrections.js';

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
  // Seed with 4 mentions (level 2) so next add → level 3
  seedCorrections(home, [{
    id: 'test1', text: 'use const', mentions: 4, level: 2,
    sessions: [], firstSeen: '', lastSeen: '',
  }]);
  await addCorrection('use const', home, embedFn);
  const content = readFileSync(join(home, '.claude', 'CLAUDE.md'), 'utf8');
  assert.ok(content.includes(MARKER_START));
  assert.ok(content.includes('use const'));
});
```

- [ ] **Step 2: Run to confirm new tests fail**

```bash
node --test tests/corrections.test.js 2>&1 | grep -E "fail|pass|Error" | head -10
```

Expected: The new tests fail because `addCorrection` isn't wired to accept `embedFn` yet... wait — it already is from Task 1. They should pass. Run anyway to confirm:

```bash
node --test tests/corrections.test.js 2>&1 | tail -5
```

Expected:
```
ℹ tests 17
ℹ pass 17
ℹ fail 0
```

- [ ] **Step 3: Commit**

```bash
git add tests/corrections.test.js
git commit -m "test(corrections): addCorrection dedup and level promotion tests"
```

---

### Task 3: Wire up `booklib correction` in bin/booklib.js

**Files:**
- Modify: `bin/booklib.js`

- [ ] **Step 1: Add the import at the top of bin/booklib.js**

Find the last `import` line (around line 48) and add after it:

```js
import { addCorrection, listCorrections, removeCorrection } from '../lib/engine/corrections.js';
```

- [ ] **Step 2: Add the `case 'correction':` block**

Find the `case 'rules':` block (around line 1234) and insert before it:

```js
case 'correction': {
  const sub = args[1];

  if (!sub || sub === 'help') {
    console.log('\nUsage:');
    console.log('  booklib correction add "<text>"   — record a correction');
    console.log('  booklib correction list           — show all corrections');
    console.log('  booklib correction remove <id>    — delete a correction\n');
    break;
  }

  if (sub === 'add') {
    const text = args.slice(2).join(' ').replace(/^["']|["']$/g, '');
    if (!text) {
      console.error('  Usage: booklib correction add "text of the correction"');
      process.exit(1);
    }
    process.stdout.write('  Recording correction (loading embedding model)...\n');
    const result = await addCorrection(text);
    const levelArrow = result.level > 1 && !result.wasExisting ? ` ↑` :
                       result.wasExisting && result.level > (result.level - 1) ? ` ↑` : '';
    const action = result.wasExisting ? 'Updated' : 'Recorded';
    console.log(`✓ ${action}: "${result.text}" (mentions: ${result.mentions}, level: ${result.level}${levelArrow})`);
    if (result.level >= 3) {
      console.log(`  → Added to ~/.claude/CLAUDE.md`);
    }
    break;
  }

  if (sub === 'list') {
    const all = listCorrections();
    if (all.length === 0) {
      console.log('\n  No corrections recorded yet.\n');
      break;
    }
    console.log(`\n► Learned corrections (${all.length} total)\n`);
    console.log(`  ${'ID'.padEnd(8)} ${'Mentions'.padEnd(10)} ${'Level'.padEnd(7)} Text`);
    for (const c of all) {
      const marker = c.level >= 3 ? '●' : ' ';
      const lvl    = `${c.level} ${marker}`;
      console.log(`  ${c.id.padEnd(8)} ${String(c.mentions).padEnd(10)} ${lvl.padEnd(7)} ${c.text.slice(0, 60)}`);
    }
    console.log('\n  ● = injected into ~/.claude/CLAUDE.md\n');
    break;
  }

  if (sub === 'remove') {
    const id = args[2];
    if (!id) {
      console.error('  Usage: booklib correction remove <id>');
      process.exit(1);
    }
    const removed = removeCorrection(id);
    if (!removed) {
      console.error(`  Not found: ${id}`);
      process.exit(1);
    }
    console.log(`✓ Removed "${removed.text}"`);
    console.log(`  → ~/.claude/CLAUDE.md updated`);
    break;
  }

  console.error(`  Unknown subcommand: ${sub}`);
  console.error('  Use: booklib correction add|list|remove');
  process.exit(1);
}

```

- [ ] **Step 3: Verify the CLI works end-to-end**

```bash
# From the worktree root
node bin/booklib.js correction list
```

Expected:
```
  No corrections recorded yet.
```

```bash
node bin/booklib.js correction add "always use const not var in JavaScript"
```

Expected:
```
  Recording correction (loading embedding model)...
✓ Recorded: "always use const not var in JavaScript" (mentions: 1, level: 1)
```

```bash
node bin/booklib.js correction list
```

Expected:
```
► Learned corrections (1 total)

  ID       Mentions   Level   Text
  xxxxxx   1          1       always use const not var in JavaScript

  ● = injected into ~/.claude/CLAUDE.md
```

- [ ] **Step 4: Run all tests to confirm nothing broke**

```bash
node --test tests/corrections.test.js 2>&1 | tail -5
```

Expected:
```
ℹ tests 17
ℹ pass 17
ℹ fail 0
```

- [ ] **Step 5: Commit**

```bash
git add bin/booklib.js
git commit -m "feat(correction): wire booklib correction add/list/remove CLI commands"
```

---

### Task 4: Smoke test level promotion end-to-end

**Files:**
- Read: `~/.booklib/corrections.jsonl` (runtime verification)
- Read: `~/.claude/CLAUDE.md` (runtime verification)

- [ ] **Step 1: Simulate level promotion by running add multiple times**

```bash
# Add the same concept 5 times using slightly different phrasing
# (same embedding model — use near-identical text to guarantee cosine > 0.85)
node bin/booklib.js correction add "never commit secrets to git"
node bin/booklib.js correction add "never commit secrets to git"
node bin/booklib.js correction add "never commit secrets to git"
node bin/booklib.js correction add "never commit secrets to git"
node bin/booklib.js correction add "never commit secrets to git"
```

Expected on 5th add:
```
✓ Updated: "never commit secrets to git" (mentions: 5, level: 3 ↑)
  → Added to ~/.claude/CLAUDE.md
```

- [ ] **Step 2: Verify CLAUDE.md was updated**

```bash
grep -A 10 "booklib-learned-start" ~/.claude/CLAUDE.md
```

Expected:
```
<!-- booklib-learned-start -->
## Learned Corrections (BookLib)

> When the user corrects your approach, run: booklib correction add "brief rule"

- never commit secrets to git

<!-- booklib-learned-end -->
```

- [ ] **Step 3: Verify list shows promotion marker**

```bash
node bin/booklib.js correction list
```

Expected:
```
► Learned corrections (N total)

  ID       Mentions   Level   Text
  xxxxxx   5          3 ●     never commit secrets to git

  ● = injected into ~/.claude/CLAUDE.md
```

- [ ] **Step 4: Verify remove cleans up CLAUDE.md**

```bash
# Get the ID from list output, then:
node bin/booklib.js correction remove <id>
grep "booklib-learned" ~/.claude/CLAUDE.md || echo "Section removed"
```

Expected: `Section removed`

- [ ] **Step 5: Clean up test corrections from real ~/.booklib/**

```bash
# The smoke test polluted real user data — clean it up
node -e "
import { loadCorrections } from './lib/engine/corrections.js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
const all = loadCorrections();
const clean = all.filter(c => c.text !== 'never commit secrets to git');
const p = join(homedir(), '.booklib', 'corrections.jsonl');
writeFileSync(p, clean.map(c => JSON.stringify(c)).join('\n') + (clean.length ? '\n' : ''));
console.log('cleaned');
"
```

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: correction memory — progressive CLAUDE.md injection v1.18.0"
```

---

## Self-Review

**Spec coverage:**
- ✅ `addCorrection(text)` — Task 1 + 2
- ✅ Semantic dedup (cosine ≥ 0.85) — Task 2
- ✅ `listCorrections()` — Task 1
- ✅ `removeCorrection(id)` — Task 1
- ✅ `rebuildLearnedSection()` — Task 1
- ✅ Level table (1/3/5/10 thresholds) — Task 1
- ✅ CLAUDE.md markers + agent instruction — Task 1
- ✅ `case 'correction':` in bin/booklib.js — Task 3
- ✅ add/list/remove output format — Task 3
- ✅ Error: missing text → exit 1 — Task 3
- ✅ Error: id not found → exit 1 — Task 3
- ✅ Corrupt corrections.jsonl → warn + return [] — Task 1

**Placeholder scan:** No TBDs. All code blocks are complete.

**Type consistency:** `addCorrection` returns `{ id, text, mentions, level, sessions, firstSeen, lastSeen, wasExisting }` consistently across Tasks 1, 2, and 3.
