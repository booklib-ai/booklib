# MCP Config Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `booklib init` with a Phase 2 that interactively wires up the BookLib MCP server config for Claude Code, Cursor, Gemini CLI, Codex, Zed, and Continue.dev.

**Architecture:** `generateMcpConfigs()` is added to `ProjectInitializer` as a sibling of `init()`. It dispatches to a `_renderMcpConfig(tool)` method that returns a descriptor (`mode`, `filePath`, `mcpKey`, `mcpValue`), then two private helpers handle JSON-merge and TOML-merge writes. Phase 2 in `bin/booklib.js` adds a `promptMcpToolSelection()` function and calls `generateMcpConfigs()` after Phase 1 finishes.

**Tech Stack:** Node.js ESM, `node:fs`, `node:readline` (already imported), no new dependencies.

---

## File Map

| File | Change |
|------|--------|
| `package.json` | Add `"booklib-mcp": "bin/booklib-mcp.js"` to `bin` field |
| `lib/project-initializer.js` | Add `generateMcpConfigs()`, `_renderMcpConfig()`, `_mergeJsonMcpServer()`, `_mergeTomlMcpSection()` |
| `bin/booklib.js` | Add `MCP_TOOL_MENU`, `promptMcpToolSelection()`, Phase 2 block inside `case 'init':` |
| `tests/engine/project-initializer-mcp.test.js` | New: 8 unit tests for `generateMcpConfigs()` |

---

## Task 1: Expose `booklib-mcp` as a named bin

**Files:**
- Modify: `package.json:5-8`

- [ ] **Step 1: Edit `package.json`**

Change the `bin` field from:

```json
"bin": {
  "skills": "bin/skills.js",
  "booklib": "bin/booklib.js"
},
```

To:

```json
"bin": {
  "skills": "bin/skills.js",
  "booklib": "bin/booklib.js",
  "booklib-mcp": "bin/booklib-mcp.js"
},
```

- [ ] **Step 2: Verify the bin script is executable**

Run:
```bash
node bin/booklib-mcp.js --version 2>&1 | head -3
```

Expected: The MCP server starts (may print something or hang waiting for stdio — Ctrl+C after 1 second is fine, no "not found" or JS error).

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "feat: expose booklib-mcp as a named bin entry"
```

---

## Task 2: Write failing tests for `generateMcpConfigs()`

**Files:**
- Create: `tests/engine/project-initializer-mcp.test.js`

- [ ] **Step 1: Create the test file**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { ProjectInitializer } from '../../lib/project-initializer.js';

function makeInit(dir) {
  return new ProjectInitializer({ projectCwd: dir });
}

// ── Per-tool output ───────────────────────────────────────────────────────────

test('generateMcpConfigs writes .claude/settings.json for claude', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bl-mcp-'));
  await makeInit(dir).generateMcpConfigs({ tools: ['claude'] });
  const settings = JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8'));
  assert.deepStrictEqual(settings.mcpServers.booklib, { command: 'booklib-mcp', args: [] });
  fs.rmSync(dir, { recursive: true });
});

test('generateMcpConfigs writes .cursor/mcp.json for cursor', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bl-mcp-'));
  await makeInit(dir).generateMcpConfigs({ tools: ['cursor'] });
  const mcp = JSON.parse(fs.readFileSync(path.join(dir, '.cursor', 'mcp.json'), 'utf8'));
  assert.deepStrictEqual(mcp.mcpServers.booklib, { command: 'booklib-mcp', args: [] });
  fs.rmSync(dir, { recursive: true });
});

test('generateMcpConfigs writes .gemini/settings.json for gemini', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bl-mcp-'));
  await makeInit(dir).generateMcpConfigs({ tools: ['gemini'] });
  const settings = JSON.parse(fs.readFileSync(path.join(dir, '.gemini', 'settings.json'), 'utf8'));
  assert.deepStrictEqual(settings.mcpServers.booklib, { command: 'booklib-mcp', args: [] });
  fs.rmSync(dir, { recursive: true });
});

test('generateMcpConfigs writes .codex/config.toml for codex', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bl-mcp-'));
  await makeInit(dir).generateMcpConfigs({ tools: ['codex'] });
  const toml = fs.readFileSync(path.join(dir, '.codex', 'config.toml'), 'utf8');
  assert.ok(toml.includes('[mcp_servers.booklib]'), 'has section header');
  assert.ok(toml.includes('command = "booklib-mcp"'), 'has command');
  assert.ok(toml.includes('args = []'), 'has args');
  fs.rmSync(dir, { recursive: true });
});

test('generateMcpConfigs writes .zed/settings.json for zed', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bl-mcp-'));
  await makeInit(dir).generateMcpConfigs({ tools: ['zed'] });
  const settings = JSON.parse(fs.readFileSync(path.join(dir, '.zed', 'settings.json'), 'utf8'));
  assert.deepStrictEqual(
    settings['context_servers']['booklib-mcp'],
    { command: { path: 'booklib-mcp', args: [] } }
  );
  fs.rmSync(dir, { recursive: true });
});

test('generateMcpConfigs writes .continue/mcpServers/booklib.yaml for continue', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bl-mcp-'));
  await makeInit(dir).generateMcpConfigs({ tools: ['continue'] });
  const yaml = fs.readFileSync(path.join(dir, '.continue', 'mcpServers', 'booklib.yaml'), 'utf8');
  assert.ok(yaml.includes('name: booklib'), 'has name');
  assert.ok(yaml.includes('command: booklib-mcp'), 'has command');
  assert.ok(yaml.includes('args: []'), 'has args');
  fs.rmSync(dir, { recursive: true });
});

// ── Merge behaviour ───────────────────────────────────────────────────────────

test('generateMcpConfigs merges into existing JSON without overwriting other servers', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bl-mcp-'));
  const claudeDir = path.join(dir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });
  const existing = { mcpServers: { 'other-server': { command: 'other', args: [] } } };
  fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify(existing));

  await makeInit(dir).generateMcpConfigs({ tools: ['claude'] });

  const settings = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf8'));
  assert.deepStrictEqual(settings.mcpServers['other-server'], { command: 'other', args: [] });
  assert.deepStrictEqual(settings.mcpServers.booklib, { command: 'booklib-mcp', args: [] });
  fs.rmSync(dir, { recursive: true });
});

test('generateMcpConfigs appends booklib section into existing TOML without altering other content', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bl-mcp-'));
  const codexDir = path.join(dir, '.codex');
  fs.mkdirSync(codexDir, { recursive: true });
  fs.writeFileSync(path.join(codexDir, 'config.toml'), '[other_service]\nkey = "value"\n');

  await makeInit(dir).generateMcpConfigs({ tools: ['codex'] });

  const toml = fs.readFileSync(path.join(codexDir, 'config.toml'), 'utf8');
  assert.ok(toml.includes('[other_service]'), 'preserves existing content');
  assert.ok(toml.includes('[mcp_servers.booklib]'), 'appends booklib section');
  fs.rmSync(dir, { recursive: true });
});
```

- [ ] **Step 2: Run tests to confirm they all fail**

Run:
```bash
node --test tests/engine/project-initializer-mcp.test.js 2>&1
```

Expected: All 8 tests fail with `TypeError: makeInit(...).generateMcpConfigs is not a function` (or similar).

---

## Task 3: Implement `generateMcpConfigs()` in `ProjectInitializer`

**Files:**
- Modify: `lib/project-initializer.js`

Add the following four methods to the `ProjectInitializer` class, between `fetchEccArtifacts()` and the HTTP helpers section (before the `// ── HTTP helpers` comment).

- [ ] **Step 1: Add `generateMcpConfigs()` method**

```js
/**
 * Writes MCP server config files for the selected tools.
 *
 * @param {object}   opts
 * @param {string[]} opts.tools   - tool names: 'claude'|'cursor'|'gemini'|'codex'|'zed'|'continue'
 * @param {boolean}  [opts.dryRun]
 * @returns {string[]} list of files written
 */
async generateMcpConfigs({ tools = [], dryRun = false } = {}) {
  const written = [];
  for (const tool of tools) {
    const config = this._renderMcpConfig(tool);
    if (!config) continue;
    const { filePath, mode } = config;
    const absPath = path.join(this.projectCwd, filePath);
    if (dryRun) {
      console.log(`[dry-run] Would write MCP config: ${filePath}`);
      written.push(filePath);
      continue;
    }
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    if (mode === 'json-merge') {
      this._mergeJsonMcpServer(absPath, filePath, config.mcpKey, config.mcpValue);
    } else if (mode === 'toml-merge') {
      this._mergeTomlMcpSection(absPath);
    } else {
      fs.writeFileSync(absPath, config.content);
    }
    console.log(`  ✅ ${filePath}`);
    written.push(filePath);
  }
  return written;
}
```

- [ ] **Step 2: Add `_renderMcpConfig()` method**

```js
/** Returns a descriptor for writing the MCP config for a given tool. */
_renderMcpConfig(tool) {
  const BOOKLIB_ENTRY = { command: 'booklib-mcp', args: [] };
  switch (tool) {
    case 'claude':
      return { filePath: '.claude/settings.json',  mode: 'json-merge', mcpKey: ['mcpServers', 'booklib'],                    mcpValue: BOOKLIB_ENTRY };
    case 'cursor':
      return { filePath: '.cursor/mcp.json',        mode: 'json-merge', mcpKey: ['mcpServers', 'booklib'],                    mcpValue: BOOKLIB_ENTRY };
    case 'gemini':
      return { filePath: '.gemini/settings.json',   mode: 'json-merge', mcpKey: ['mcpServers', 'booklib'],                    mcpValue: BOOKLIB_ENTRY };
    case 'zed':
      return { filePath: '.zed/settings.json',      mode: 'json-merge', mcpKey: ['context_servers', 'booklib-mcp'],           mcpValue: { command: { path: 'booklib-mcp', args: [] } } };
    case 'codex':
      return { filePath: '.codex/config.toml',      mode: 'toml-merge' };
    case 'continue':
      return { filePath: '.continue/mcpServers/booklib.yaml', mode: 'overwrite', content: 'name: booklib\ncommand: booklib-mcp\nargs: []\n' };
    default:
      return null;
  }
}
```

- [ ] **Step 3: Add `_mergeJsonMcpServer()` method**

```js
/** Reads an existing JSON config (if any), sets keyPath to value, writes back. */
_mergeJsonMcpServer(absPath, filePath, keyPath, value) {
  let root = {};
  if (fs.existsSync(absPath)) {
    try {
      root = JSON.parse(fs.readFileSync(absPath, 'utf8'));
    } catch {
      console.warn(`  ⚠️  Could not parse ${filePath} — writing fresh`);
      root = {};
    }
  }
  let node = root;
  for (let i = 0; i < keyPath.length - 1; i++) {
    if (!node[keyPath[i]] || typeof node[keyPath[i]] !== 'object') node[keyPath[i]] = {};
    node = node[keyPath[i]];
  }
  node[keyPath[keyPath.length - 1]] = value;
  fs.writeFileSync(absPath, JSON.stringify(root, null, 2) + '\n');
}
```

- [ ] **Step 4: Add `_mergeTomlMcpSection()` method**

```js
/** Appends or replaces the [mcp_servers.booklib] section in a TOML file. */
_mergeTomlMcpSection(absPath) {
  const BOOKLIB_BLOCK = '[mcp_servers.booklib]\ncommand = "booklib-mcp"\nargs = []\n';
  // Match from the section header to the next section header or end of string
  const SECTION_RE = /\[mcp_servers\.booklib\][\s\S]*?(?=\n\[|$)/;

  let existing = '';
  if (fs.existsSync(absPath)) {
    existing = fs.readFileSync(absPath, 'utf8');
  }

  if (SECTION_RE.test(existing)) {
    fs.writeFileSync(absPath, existing.replace(SECTION_RE, BOOKLIB_BLOCK.trimEnd()));
  } else {
    fs.writeFileSync(absPath, existing + (existing.endsWith('\n') ? '' : '\n') + '\n' + BOOKLIB_BLOCK);
  }
}
```

- [ ] **Step 5: Run the tests**

Run:
```bash
node --test tests/engine/project-initializer-mcp.test.js 2>&1
```

Expected: All 8 tests pass (`✓` for each).

- [ ] **Step 6: Run the full test suite to check for regressions**

Run:
```bash
node --test tests/engine/*.test.js 2>&1
```

Expected: All tests pass (same count as before, 0 failures).

- [ ] **Step 7: Commit**

```bash
git add lib/project-initializer.js tests/engine/project-initializer-mcp.test.js
git commit -m "feat: add generateMcpConfigs() to ProjectInitializer with per-tool renderers and merge logic"
```

---

## Task 4: Add MCP prompt and Phase 2 to `bin/booklib.js`

**Files:**
- Modify: `bin/booklib.js`

- [ ] **Step 1: Add `MCP_TOOL_MENU` constant after the existing `TOOL_MENU`**

Insert after line 62 (after the closing `];` of `TOOL_MENU`):

```js
const MCP_TOOL_MENU = [
  { num: 1, name: 'Claude Code', target: 'claude',   file: '.claude/settings.json' },
  { num: 2, name: 'Cursor',      target: 'cursor',   file: '.cursor/mcp.json' },
  { num: 3, name: 'Gemini CLI',  target: 'gemini',   file: '.gemini/settings.json' },
  { num: 4, name: 'Codex',       target: 'codex',    file: '.codex/config.toml' },
  { num: 5, name: 'Zed',         target: 'zed',      file: '.zed/settings.json' },
  { num: 6, name: 'Continue',    target: 'continue', file: '.continue/mcpServers/booklib.yaml' },
  { num: 7, name: 'All of the above', target: 'all', file: null },
];
```

- [ ] **Step 2: Add `promptMcpToolSelection()` function after `promptToolSelection()`**

Insert after the closing `}` of `promptToolSelection()` (after line 82):

```js
async function promptMcpToolSelection() {
  const SEP = '━'.repeat(51);
  process.stdout.write(`\n${SEP}\n  MCP Server Setup\n${SEP}\n\n`);
  process.stdout.write('  BookLib has an MCP server — your AI tools can call it\n');
  process.stdout.write('  directly to search knowledge, fetch context, and create\n');
  process.stdout.write('  notes without leaving the conversation.\n\n');
  process.stdout.write('  Wire up the MCP server? (Y/n): ');

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const yn = await new Promise(resolve => {
    rl.once('line', line => { rl.close(); resolve(line.trim().toLowerCase()); });
  });
  if (yn === 'n' || yn === 'no') return null;

  process.stdout.write('\n  Which tools should I configure? (select all that apply)\n\n');
  for (const t of MCP_TOOL_MENU) {
    const fileInfo = t.file ? `  → ${t.file}` : '';
    process.stdout.write(`  ${t.num}. ${t.name.padEnd(18)}${fileInfo}\n`);
  }
  process.stdout.write('\n  Enter numbers separated by commas (1,2,5) or 7 for all: ');

  const rl2 = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise(resolve => {
    rl2.once('line', line => { rl2.close(); resolve(line.trim()); });
  });

  if (!answer) return 'all';
  const nums = answer.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n));
  if (nums.length === 0 || nums.includes(7)) return 'all';
  const selected = nums.map(n => MCP_TOOL_MENU.find(t => t.num === n)?.target).filter(Boolean);
  return selected.length > 0 ? selected.join(',') : 'all';
}
```

- [ ] **Step 3: Add Phase 2 block inside `case 'init':` before the final `if (!dryRun)` done message**

Locate the line `if (!dryRun) {` that prints "Done. Add these files to your repo..." (around line 566). Insert the following block **immediately before** that line:

```js
      // ── Phase 2: MCP server setup ─────────────────────────────────────────
      if (!dryRun) {
        const { configPath: cfgPath } = resolveBookLibPaths();
        let mcpSavedConfig = {};
        try { mcpSavedConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch { /* no config yet */ }

        const hasMcpToolFlag = args.some(a => a.startsWith('--mcp-tool='));
        let mcpTargets;

        if (hasMcpToolFlag) {
          const mcpToolArg = args.find(a => a.startsWith('--mcp-tool='))?.split('=')[1];
          mcpTargets = mcpToolArg === 'all'
            ? ['claude', 'cursor', 'gemini', 'codex', 'zed', 'continue']
            : mcpToolArg.split(',').map(t => t.trim());
        } else if (mcpSavedConfig.mcpTools?.length) {
          mcpTargets = mcpSavedConfig.mcpTools;
          console.log(`Using saved MCP tool selection: ${mcpTargets.join(', ')} (pass --mcp-tool=X to override)\n`);
        } else {
          const selection = await promptMcpToolSelection();
          if (selection === null) {
            mcpTargets = null;
          } else {
            mcpTargets = selection === 'all'
              ? ['claude', 'cursor', 'gemini', 'codex', 'zed', 'continue']
              : selection.split(',');
          }
        }

        // Persist selection (whether from prompt or --mcp-tool flag)
        if (mcpTargets) {
          try {
            fs.writeFileSync(cfgPath, JSON.stringify({ ...mcpSavedConfig, mcpTools: mcpTargets }, null, 2));
          } catch { /* best-effort */ }

          console.log(`\nConfiguring MCP server for: ${mcpTargets.join(', ')}\n`);
          await initializer.generateMcpConfigs({ tools: mcpTargets });
          console.log('');
        }

        // Note for Windsurf users: MCP config is global-only
        const phase1ToolList = targetArg === 'all'
          ? ['claude', 'cursor', 'copilot', 'gemini', 'codex', 'windsurf']
          : (targetArg?.split(',') ?? []);
        if (phase1ToolList.includes('windsurf')) {
          console.log('  ℹ️  Windsurf: MCP config is global-only. Set it up at ~/.codeium/windsurf/mcp_config.json manually.');
        }
      }
```

- [ ] **Step 4: Smoke-test the dry-run path**

Run:
```bash
node bin/booklib.js init --dry-run --skills=effective-python 2>&1 | head -20
```

Expected: Prints dry-run output for Phase 1 (standards docs) without prompting for MCP (Phase 2 is skipped in `--dry-run` mode).

- [ ] **Step 5: Commit**

```bash
git add bin/booklib.js
git commit -m "feat: add Phase 2 MCP setup prompt to booklib init"
```

---

## Task 5: End-to-end smoke test and version bump

**Files:**
- Modify: `package.json` (version field)

- [ ] **Step 1: Run the full test suite one final time**

Run:
```bash
node --test tests/engine/*.test.js 2>&1
```

Expected: All tests pass, 0 failures.

- [ ] **Step 2: Run the full test suite one more time to confirm everything is clean**

Run:
```bash
node --test tests/engine/*.test.js 2>&1
```

Expected: All tests pass including the 8 new MCP tests, 0 failures.

- [ ] **Step 3: Bump version in `package.json` to `1.12.0`**

Change:
```json
"version": "1.11.0",
```

To:
```json
"version": "1.12.0",
```

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "feat: v1.12.0 — MCP config generation in booklib init"
```
