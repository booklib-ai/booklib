# BookLib Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `booklib rules` — a standalone CLI for listing, installing, and inspecting the curated language rule sets bundled with BookLib.

**Architecture:** A new `lib/rules/rules-manager.js` module provides `listAvailable()`, `installRule()`, and `status()`. The module reads from the local `rules/` directory (not network). `bin/booklib.js` gets a `case 'rules':` dispatcher that routes `list`, `install`, and `status` subcommands. No new npm dependencies — all Node.js built-ins.

**Tech Stack:** Node.js ESM, node:test
**Worktree:** `/Users/fvst/other/fp/skills/.worktrees/feat-rules/`
**Run tests with:** `node --test tests/rules/rules-manager.test.js`

---

## Setup: rebase worktree onto main

Before starting Task 1, update the feat/rules worktree to include the doctor feature merged into main:

```bash
cd /Users/fvst/other/fp/skills/.worktrees/feat-rules
git rebase main
```

Expected: fast-forward or clean rebase onto main (c7e5ae3).

---

### Task 1: `lib/rules/rules-manager.js`

**Files:**
- Create: `lib/rules/rules-manager.js`
- Create: `tests/rules/rules-manager.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/rules/rules-manager.test.js`:

```js
// tests/rules/rules-manager.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, rmSync, mkdirSync, writeFileSync,
  existsSync, readFileSync, readdirSync,
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
  // The source file already has frontmatter if it starts with ---
  // We test by checking the file is not double-wrapped
  const cwd = tmp();
  const home = tmp();
  installRule('python', { cwd, home });
  const destFile = join(cwd, '.cursor', 'rules', 'python-effective-python.mdc');
  const content = readFileSync(destFile, 'utf8');
  const frontmatterCount = (content.match(/^---/gm) || []).length;
  // Should have exactly 2 --- markers (start and end of frontmatter)
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/fvst/other/fp/skills/.worktrees/feat-rules && node --test tests/rules/rules-manager.test.js
```
Expected: `Cannot find module '../../lib/rules/rules-manager.js'`

- [ ] **Step 3: Create `lib/rules/rules-manager.js`**

```js
// lib/rules/rules-manager.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const RULES_DIR = path.join(PACKAGE_ROOT, 'rules');

function markerStart(lang) { return `<!-- booklib-rules-${lang}-start -->`; }
function markerEnd(lang)   { return `<!-- booklib-rules-${lang}-end -->`; }
function escapeRegex(s)    { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/**
 * Lists all bundled language rule sets with project/global install status.
 */
export function listAvailable(cwd = process.cwd(), home = os.homedir()) {
  if (!fs.existsSync(RULES_DIR)) return [];

  const claudeMdPath = path.join(home, '.claude', 'CLAUDE.md');
  const claudeMdContent = fs.existsSync(claudeMdPath)
    ? fs.readFileSync(claudeMdPath, 'utf8')
    : '';

  const langDirs = fs.readdirSync(RULES_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);

  return langDirs.map(lang => {
    const files = fs.readdirSync(path.join(RULES_DIR, lang))
      .filter(f => f.endsWith('.md'));

    const cursorRulesDir = path.join(cwd, '.cursor', 'rules');
    const installedProject = fs.existsSync(cursorRulesDir) &&
      fs.readdirSync(cursorRulesDir).some(f => f.startsWith(`${lang}-`) && f.endsWith('.mdc'));

    const installedGlobal = claudeMdContent.includes(markerStart(lang));

    return { lang, files, installedProject, installedGlobal };
  });
}

/**
 * Installs a language rule set to the project (.cursor/rules/) or globally (~/.claude/CLAUDE.md).
 *
 * @param {string} lang
 * @param {{ cwd?, home?, global?, dryRun? }} opts
 * @returns {string[]} written file paths
 */
export function installRule(lang, {
  cwd = process.cwd(),
  home = os.homedir(),
  global: isGlobal = false,
  dryRun = false,
} = {}) {
  const langDir = path.join(RULES_DIR, lang);
  if (!fs.existsSync(langDir)) {
    const available = fs.readdirSync(RULES_DIR, { withFileTypes: true })
      .filter(e => e.isDirectory()).map(e => e.name);
    throw new Error(`Unknown language: '${lang}'. Available: ${available.join(', ')}`);
  }

  const mdFiles = fs.readdirSync(langDir).filter(f => f.endsWith('.md'));
  if (mdFiles.length === 0) return [];

  return isGlobal
    ? _installGlobal(lang, langDir, mdFiles, home, dryRun)
    : _installProject(lang, langDir, mdFiles, cwd, dryRun);
}

function _installProject(lang, langDir, mdFiles, cwd, dryRun) {
  const destDir = path.join(cwd, '.cursor', 'rules');
  const written = [];

  for (const file of mdFiles) {
    let content = fs.readFileSync(path.join(langDir, file), 'utf8');
    if (!content.trimStart().startsWith('---')) {
      const name = file.replace(/\.md$/, '');
      content = `---\ndescription: ${lang} ${name} standards (BookLib)\nalwaysApply: false\n---\n\n${content}`;
    }
    const destPath = path.join(destDir, `${lang}-${file.replace(/\.md$/, '.mdc')}`);
    if (!dryRun) {
      fs.mkdirSync(destDir, { recursive: true });
      fs.writeFileSync(destPath, content);
    }
    written.push(destPath);
  }
  return written;
}

function _installGlobal(lang, langDir, mdFiles, home, dryRun) {
  const claudeDir  = path.join(home, '.claude');
  const claudeMdPath = path.join(claudeDir, 'CLAUDE.md');

  const body = mdFiles
    .map(f => fs.readFileSync(path.join(langDir, f), 'utf8'))
    .join('\n\n');

  const section = [
    markerStart(lang),
    `## ${lang.charAt(0).toUpperCase() + lang.slice(1)} Standards (BookLib)`,
    '',
    body,
    markerEnd(lang),
  ].join('\n');

  if (!dryRun) {
    fs.mkdirSync(claudeDir, { recursive: true });
    let existing = '';
    try { existing = fs.readFileSync(claudeMdPath, 'utf8'); } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }

    const re = new RegExp(
      `${escapeRegex(markerStart(lang))}[\\s\\S]*?${escapeRegex(markerEnd(lang))}`,
    );
    const updated = existing.includes(markerStart(lang))
      ? existing.replace(re, section)
      : (existing ? `${existing}\n\n${section}\n` : `${section}\n`);

    fs.writeFileSync(claudeMdPath, updated);
  }
  return [claudeMdPath];
}

/**
 * Returns sizes of all installed rules in the current project and globally.
 */
export function status(cwd = process.cwd(), home = os.homedir()) {
  const cursorRulesDir = path.join(cwd, '.cursor', 'rules');
  const claudeMdPath   = path.join(home, '.claude', 'CLAUDE.md');

  const cursor = [];
  if (fs.existsSync(cursorRulesDir)) {
    for (const file of fs.readdirSync(cursorRulesDir)) {
      if (!file.endsWith('.mdc')) continue;
      const p = path.join(cursorRulesDir, file);
      cursor.push({ path: p, sizeBytes: fs.statSync(p).size });
    }
  }

  const global = [];
  if (fs.existsSync(claudeMdPath)) {
    const content = fs.readFileSync(claudeMdPath, 'utf8');
    const re = /<!-- booklib-rules-(\w+)-start -->([\s\S]*?)<!-- booklib-rules-\1-end -->/g;
    let match;
    while ((match = re.exec(content)) !== null) {
      global.push({ lang: match[1], sizeBytes: Buffer.byteLength(match[0], 'utf8') });
    }
  }

  const totalBytes = cursor.reduce((s, c) => s + c.sizeBytes, 0) +
    global.reduce((s, g) => s + g.sizeBytes, 0);

  return { cursor, global, totalBytes };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/fvst/other/fp/skills/.worktrees/feat-rules && node --test tests/rules/rules-manager.test.js
```
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
cd /Users/fvst/other/fp/skills/.worktrees/feat-rules && git add lib/rules/rules-manager.js tests/rules/rules-manager.test.js && git commit -m "feat(rules): add rules-manager with listAvailable/installRule/status"
```

---

### Task 2: `bin/booklib.js` — `case 'rules':`

**Files:**
- Modify: `bin/booklib.js`

- [ ] **Step 1: Add imports to `bin/booklib.js`**

After the existing doctor imports (around line 34), add:

```js
import { listAvailable as listAvailableRules, installRule as installRuleFn, status as rulesStatus } from '../lib/rules/rules-manager.js';
```

- [ ] **Step 2: Add `formatBytes` helper function**

After the `parseFlag` function (around line 44) in `bin/booklib.js`, add:

```js
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
```

- [ ] **Step 3: Add `case 'rules':` before `default:`**

```js
case 'rules': {
  const subcommand = args[1];

  switch (subcommand) {
    case 'list': {
      const available = listAvailableRules();
      console.log('\n► Available rule sets\n');
      console.log(`  ${'Bundled:'.padEnd(22)} ${'project'.padEnd(12)} global`);
      for (const item of available) {
        const icon = (item.installedProject || item.installedGlobal) ? '✓' : '·';
        const proj = item.installedProject ? 'installed' : '—';
        const glob = item.installedGlobal  ? 'installed' : '—';
        console.log(`  ${icon} ${item.lang.padEnd(22)} ${proj.padEnd(12)} ${glob}`);
      }
      console.log('');
      console.log('  booklib rules install <lang>           → add to .cursor/rules/');
      console.log('  booklib rules install <lang> --global  → add to ~/.claude/CLAUDE.md');
      console.log('');
      break;
    }

    case 'install': {
      const lang = args[2];
      if (!lang || lang.startsWith('--')) {
        console.error('  Usage: booklib rules install <lang> [--global]');
        process.exit(1);
      }
      const isGlobal = args.includes('--global');
      try {
        const written = installRuleFn(lang, { global: isGlobal });
        if (isGlobal) {
          const sizeBytes = fs.statSync(written[0]).size;
          console.log(`\n✓ Installed ${lang} rules globally`);
          console.log(`  ${written[0]}  (${formatBytes(sizeBytes)})\n`);
        } else {
          console.log(`\n✓ Installed ${lang} rules`);
          for (const p of written) {
            console.log(`  ${p}  (${formatBytes(fs.statSync(p).size)})`);
          }
          console.log('');
        }
      } catch (err) {
        console.error(`  ${err.message}`);
        process.exit(1);
      }
      break;
    }

    case 'status': {
      const st = rulesStatus();
      console.log('\n► Rules status\n');

      if (st.cursor.length === 0 && st.global.length === 0) {
        console.log('  No rules installed in current project.\n');
        console.log('  Tip: booklib rules install <lang> to add standards.\n');
        break;
      }

      if (st.cursor.length > 0) {
        console.log('  .cursor/rules/ (project)');
        for (const item of st.cursor) {
          console.log(`    ${path.basename(item.path).padEnd(42)} ${formatBytes(item.sizeBytes)}`);
        }
        console.log('');
      }

      if (st.global.length > 0) {
        console.log('  ~/.claude/CLAUDE.md (global)');
        for (const item of st.global) {
          console.log(`    ${item.lang.padEnd(42)} ${formatBytes(item.sizeBytes)}`);
        }
        console.log('');
      }

      const projCount = st.cursor.length;
      const globCount = st.global.length;
      console.log(`  Total: ${formatBytes(st.totalBytes)} across ${projCount} project + ${globCount} global rule(s)\n`);
      break;
    }

    default:
      console.log('\n  booklib rules list                          — show available rule sets');
      console.log('  booklib rules install <lang>                — install to .cursor/rules/');
      console.log('  booklib rules install <lang> --global       — install to ~/.claude/CLAUDE.md');
      console.log('  booklib rules status                        — show installed rules + sizes\n');
  }
  break;
}
```

- [ ] **Step 4: Smoke tests**

```bash
cd /Users/fvst/other/fp/skills/.worktrees/feat-rules && node bin/booklib.js rules list
```
Expected: table showing available langs with project/global columns, no crash.

```bash
cd /Users/fvst/other/fp/skills/.worktrees/feat-rules && node bin/booklib.js rules install python
```
Expected: `✓ Installed python rules` with a file path. Verify the file exists:
```bash
ls /Users/fvst/other/fp/skills/.worktrees/feat-rules/.cursor/rules/
```
Expected: `python-effective-python.mdc`

```bash
cd /Users/fvst/other/fp/skills/.worktrees/feat-rules && node bin/booklib.js rules status
```
Expected: shows the installed file with size.

```bash
cd /Users/fvst/other/fp/skills/.worktrees/feat-rules && node bin/booklib.js rules install scala
```
Expected: `Unknown language: 'scala'. Available: ...` — exits 1, no crash.

- [ ] **Step 5: Commit**

```bash
cd /Users/fvst/other/fp/skills/.worktrees/feat-rules && git add bin/booklib.js && git commit -m "feat(rules): wire booklib rules list/install/status commands"
```

---

### Task 3: Full test run + regression check

- [ ] **Step 1: Run all rules tests**

```bash
cd /Users/fvst/other/fp/skills/.worktrees/feat-rules && node --test tests/rules/rules-manager.test.js
```
Expected: all tests pass (0 failures)

- [ ] **Step 2: Run doctor + wizard tests for regressions**

```bash
cd /Users/fvst/other/fp/skills/.worktrees/feat-rules && node --test tests/doctor/usage-tracker.test.js tests/doctor/hook-installer.test.js tests/wizard/prompt.test.js tests/wizard/project-detector.test.js tests/wizard/skill-recommender.test.js tests/wizard/integration-detector.test.js tests/wizard/slot-count.test.js
```
Expected: all pass (0 failures)
