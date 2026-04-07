# Wizard UX Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 6 systemic UX issues in `booklib init` — progress feedback, recommendation quality, Copilot detection, readline races, slot explanation, and ASCII banner.

**Architecture:** The indexer gains an `onProgress` callback. The wizard flow is reordered: banner → project detect → health check → tool detect → index build (with progress) → recommend from search index → install/cleanup → config files → summary. Prompt functions use a shared readline session. AgentDetector gains VS Code extension scanning.

**Tech Stack:** Node.js ESM, `node --test`, readline, `BookLibSearcher`, `AgentDetector`.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `lib/engine/indexer.js` | Modify | Add `onProgress` callback to `indexDirectory()` loop |
| `lib/agent-detector.js` | Modify | Add VS Code extension detection for Copilot |
| `lib/wizard/prompt.js` | Modify | Add `createSession()` shared readline factory |
| `lib/wizard/index.js` | Rewrite | New flow, health check, index-based recommender, cleanup, banner |
| `tests/agent-detector.test.js` | Modify | Add extension detection tests |
| `tests/wizard/prompt-session.test.js` | Create | Tests for `createSession()` |

---

## Task 1: Index progress callback

**Files:**
- Modify: `lib/engine/indexer.js:80-134`
- Test: `tests/engine/indexer-bm25.test.js` (verify no regression)

- [ ] **Step 1: Add `onProgress` to `indexDirectory` options**

In `lib/engine/indexer.js`, change the method signature at line 80 from:

```js
  async indexDirectory(dirPath, clearFirst = false, opts = {}) {
    const { quiet = false } = opts;
```

to:

```js
  async indexDirectory(dirPath, clearFirst = false, opts = {}) {
    const { quiet = false, onProgress } = opts;
```

- [ ] **Step 2: Call `onProgress` in the file loop**

Inside the `for (const file of files)` loop (line 102), add the callback call right after the `continue` from the catch block (after line 115) and before the quiet/verbose logging (line 117). Find:

```js
      if (quiet) {
        totalFiles++;
        totalChunks += chunks.length;
      } else {
```

Insert BEFORE that block:

```js
      const fileIndex = files.indexOf(file);
      onProgress?.({ current: fileIndex + 1, total: files.length, file: relativePath });
```

- [ ] **Step 3: Run existing indexer tests**

Run: `node --test tests/engine/indexer-bm25.test.js`
Expected: PASS (onProgress is optional, existing callers unaffected)

- [ ] **Step 4: Commit**

```bash
git add lib/engine/indexer.js
git commit -m "feat(indexer): add onProgress callback to indexDirectory"
```

---

## Task 2: VS Code / Copilot detection

**Files:**
- Modify: `lib/agent-detector.js`
- Modify: `tests/agent-detector.test.js`

- [ ] **Step 1: Write failing test for VS Code extension detection**

Append to `tests/agent-detector.test.js`:

```js
test('detects copilot when VS Code extension directory exists', () => {
  const cwd = tmpDir();
  const home = tmpDir();
  mkdirSync(path.join(home, '.vscode', 'extensions', 'github.copilot-1.234.0'), { recursive: true });
  const detector = new AgentDetector({ cwd, checkPath: false, home });
  const detected = detector.detect();
  assert.ok(detected.includes('copilot'), 'copilot not detected from VS Code extension');
  rmSync(cwd, { recursive: true });
  rmSync(home, { recursive: true });
});

test('does not detect copilot when no VS Code extensions exist', () => {
  const cwd = tmpDir();
  const home = tmpDir();
  const detector = new AgentDetector({ cwd, checkPath: false, home });
  const detected = detector.detect();
  assert.ok(!detected.includes('copilot'), 'copilot falsely detected');
  rmSync(cwd, { recursive: true });
  rmSync(home, { recursive: true });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `node --test tests/agent-detector.test.js`
Expected: FAIL — `AgentDetector` doesn't accept `home` option

- [ ] **Step 3: Implement extension detection**

Replace the full content of `lib/agent-detector.js`:

```js
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

/**
 * Detects which AI coding agents are present in the project or on $PATH.
 * Always returns at least ['claude'].
 */
export class AgentDetector {
  /**
   * @param {object} opts
   * @param {string}  [opts.cwd]       - project root to check for config dirs/files
   * @param {boolean} [opts.checkPath] - whether to check $PATH (default true)
   * @param {string}  [opts.home]      - home directory override (for testing)
   */
  constructor({ cwd = process.cwd(), checkPath = true, home } = {}) {
    this.cwd = cwd;
    this.checkPath = checkPath;
    this.home = home ?? os.homedir();
  }

  detect() {
    const found = new Set(['claude']); // always present

    const DIR_SIGNALS = {
      cursor:    ['.cursor'],
      'roo-code':  ['.roo'],
      openhands: ['.openhands'],
      junie:     ['.junie'],
      goose:     ['.goose'],
      letta:     ['.letta'],
      windsurf:  ['.windsurf'],
      gemini:    ['.gemini'],
    };

    const FILE_SIGNALS = {
      opencode: ['opencode.toml'],
      copilot:  ['.github/copilot-instructions.md'],
    };

    const PATH_SIGNALS = {
      cursor:   'cursor',
      codex:    'codex',
      windsurf: 'windsurf',
      gemini:   'gemini',
      goose:    'goose',
      opencode: 'opencode',
    };

    const EXTENSION_SIGNALS = {
      copilot: ['github.copilot', 'github.copilot-chat'],
    };

    for (const [agent, dirs] of Object.entries(DIR_SIGNALS)) {
      if (dirs.some(dir => fs.existsSync(path.join(this.cwd, dir)))) {
        found.add(agent);
      }
    }

    for (const [agent, files] of Object.entries(FILE_SIGNALS)) {
      if (files.some(file => fs.existsSync(path.join(this.cwd, file)))) {
        found.add(agent);
      }
    }

    // VS Code extension detection
    const extDir = path.join(this.home, '.vscode', 'extensions');
    if (fs.existsSync(extDir)) {
      let entries;
      try { entries = fs.readdirSync(extDir); } catch { entries = []; }
      for (const [agent, prefixes] of Object.entries(EXTENSION_SIGNALS)) {
        if (prefixes.some(p => entries.some(e => e.startsWith(p)))) {
          found.add(agent);
        }
      }
    }

    if (this.checkPath) {
      for (const [agent, bin] of Object.entries(PATH_SIGNALS)) {
        if (this._inPath(bin)) found.add(agent);
      }
    }

    return [...found];
  }

  _inPath(bin) {
    try {
      const cmd = process.platform === 'win32' ? `where ${bin}` : `which ${bin}`;
      execSync(cmd, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/agent-detector.test.js`
Expected: 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/agent-detector.js tests/agent-detector.test.js
git commit -m "feat(agent-detector): detect Copilot via VS Code extensions directory"
```

---

## Task 3: Shared readline session

**Files:**
- Modify: `lib/wizard/prompt.js`
- Create: `tests/wizard/prompt-session.test.js`

- [ ] **Step 1: Write tests for `createSession`**

Create `tests/wizard/prompt-session.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../../lib/wizard/prompt.js';
import { Readable } from 'node:stream';

function fakeStdin(lines) {
  const stream = new Readable({
    read() {
      if (lines.length > 0) {
        this.push(lines.shift() + '\n');
      } else {
        this.push(null);
      }
    }
  });
  return stream;
}

test('createSession confirm returns true for "y"', async () => {
  const stdin = fakeStdin(['y']);
  const session = createSession({ input: stdin, output: process.stdout });
  const result = await session.confirm('Continue?', false);
  assert.strictEqual(result, true);
  session.close();
});

test('createSession confirm returns default on empty input', async () => {
  const stdin = fakeStdin(['']);
  const session = createSession({ input: stdin, output: process.stdout });
  const result = await session.confirm('Continue?', true);
  assert.strictEqual(result, true);
  session.close();
});

test('createSession sequential calls do not race', async () => {
  const stdin = fakeStdin(['y', 'hello', 'n']);
  const session = createSession({ input: stdin, output: process.stdout });
  const r1 = await session.confirm('First?', false);
  const r2 = await session.readText('Name: ');
  const r3 = await session.confirm('Third?', true);
  assert.strictEqual(r1, true);
  assert.strictEqual(r2, 'hello');
  assert.strictEqual(r3, false);
  session.close();
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `node --test tests/wizard/prompt-session.test.js`
Expected: FAIL — `createSession is not a function`

- [ ] **Step 3: Implement `createSession` in prompt.js**

Add at the end of `lib/wizard/prompt.js` (keep existing standalone functions for backwards compatibility):

```js
/**
 * Creates a shared readline session for the wizard.
 * All prompt methods share one readline interface — no race conditions.
 *
 * @param {{ input?: Readable, output?: Writable }} [opts] - override for testing
 */
export function createSession(opts = {}) {
  const rl = createInterface({
    input: opts.input ?? process.stdin,
    output: opts.output ?? process.stdout,
  });

  function question(prompt) {
    return new Promise(resolve => {
      rl.question(prompt, answer => resolve(answer.trim()));
    });
  }

  return {
    async confirm(text, defaultY = true) {
      const answer = await question(`${text} [${defaultY ? 'Y/n' : 'y/N'}] `);
      if (!answer) return defaultY;
      return answer.toLowerCase().startsWith('y');
    },

    async readText(prompt) {
      return question(prompt);
    },

    async multiSelect(title, choices) {
      process.stdout.write(`\n${title}\n\n`);
      choices.forEach((c, i) => {
        const desc = c.description ? `  — ${c.description}` : '';
        process.stdout.write(`  ${i + 1}. ${c.label}${desc}\n`);
      });
      process.stdout.write(`\n  [A] All  [1,2,3...] pick  [S] Skip\n\n`);
      const answer = await question('  > ');
      if (!answer) return choices.map((_, i) => i);
      if (answer.toLowerCase() === 'a') return choices.map((_, i) => i);
      if (answer.toLowerCase() === 's') return [];
      return answer.split(',')
        .map(n => parseInt(n.trim(), 10) - 1)
        .filter(n => !isNaN(n) && n >= 0 && n < choices.length);
    },

    async numberedInput(prompt, maxN) {
      const answer = await question(prompt);
      if (!answer) return [];
      return answer.split(',')
        .map(n => parseInt(n.trim(), 10) - 1)
        .filter(n => !isNaN(n) && n >= 0 && n < maxN);
    },

    close() {
      rl.close();
    },
  };
}
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/wizard/prompt-session.test.js`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/wizard/prompt.js tests/wizard/prompt-session.test.js
git commit -m "feat(prompt): add createSession for race-free wizard I/O"
```

---

## Task 4: Wizard full rewrite

**Files:**
- Rewrite: `lib/wizard/index.js`

This is the largest task — it rewrites the wizard with the new flow, ASCII banner, health check, index-based recommendations, and cleanup step. All prompt calls use the session object from Task 3.

- [ ] **Step 1: Rewrite `lib/wizard/index.js`**

Replace the entire `runSetup` function and all step functions with the new flow. Keep `runRelevanceAudit` and `runWizard` entry point unchanged.

```js
// lib/wizard/index.js
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createSession, sep } from './prompt.js';
import { detect as detectProject } from './project-detector.js';
import { SKILL_LIMIT } from './skill-recommender.js';
import { detectIntegrations } from './integration-detector.js';
import { SkillFetcher, countInstalledSlots, listInstalledSkillNames, installBundledSkill } from '../skill-fetcher.js';
import { BookLibIndexer } from '../engine/indexer.js';
import { BookLibSearcher } from '../engine/searcher.js';
import { AgentDetector } from '../agent-detector.js';
import { ProjectInitializer } from '../project-initializer.js';
import { resolveBookLibPaths } from '../paths.js';

const AGENT_LABELS = {
  claude: 'Claude Code', cursor: 'Cursor', copilot: 'Copilot',
  gemini: 'Gemini CLI', codex: 'Codex', windsurf: 'Windsurf',
  'roo-code': 'Roo Code', openhands: 'OpenHands', junie: 'Junie',
  goose: 'Goose', opencode: 'OpenCode', letta: 'Letta',
};
const ALL_AGENTS = Object.keys(AGENT_LABELS);

export async function runWizard(cwd = process.cwd()) {
  const markerPath = path.join(cwd, '.booklib', 'initialized');
  if (fs.existsSync(markerPath)) {
    return runRelevanceAudit(cwd);
  }
  return runSetup(cwd);
}

// ── Setup flow ───────────────────────────────────────────────────────────────

async function runSetup(cwd) {
  const session = createSession();

  try {
    // 1. Banner
    printBanner();

    // 2. Project detection
    const project = await stepProjectDetection(session, cwd);

    // 3. Health check — diagnose slot problems
    const slotsUsed = countInstalledSlots();
    const installedNames = listInstalledSkillNames();
    stepHealthCheck(slotsUsed, installedNames);

    // 4. AI tool detection
    const selectedAgents = await stepToolSelection(session, cwd);

    // 5. Build index (with progress)
    await stepIndexBuild();

    // 6. Recommend from search index + install/cleanup
    const selectedSkills = await stepRecommendAndInstall(session, project, slotsUsed, installedNames);

    // 7. Write config files
    const skillsForConfig = selectedSkills.length > 0 ? selectedSkills : installedNames.slice(0, 10);
    await stepWriteConfigs(session, cwd, selectedAgents, skillsForConfig);

    // 8. Summary
    printSummary(selectedSkills.length);

    // Mark as initialized
    const markerPath = path.join(cwd, '.booklib', 'initialized');
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    fs.writeFileSync(markerPath, new Date().toISOString());
  } finally {
    session.close();
  }
}

function printBanner() {
  console.log('');
  console.log('      \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u252c\u2500\u2500\u2500\u2500\u2500\u2500\u2510 \u2726');
  console.log('      \u2502 \u2500\u2500\u2500  \u2502 \u2500\u2500\u2500  \u2502');
  console.log('      \u2502 \u2500\u2500   \u2502 \u2500\u2500   \u2502  BookLib');
  console.log('      \u2502 \u2500\u2500\u2500  \u2502 \u2500\u2500\u2500  \u2502');
  console.log('      \u2502 \u2500\u2500   \u2502 \u2500\u2500   \u2502  AI-agent skills from');
  console.log('      \u2502 \u2500\u2500\u2500  \u2502 \u2500\u2500\u2500  \u2502  expert knowledge');
  console.log('      \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2518');
  console.log('');
}

async function stepProjectDetection(session, cwd) {
  process.stdout.write('\u25ba What are you building?\n');
  const project = detectProject(cwd);

  if (project.languages.length > 0) {
    const langs = project.languages.join(', ');
    const fw = project.frameworks.length ? ` (${project.frameworks.join(', ')})` : '';
    process.stdout.write(`  Auto-detected: ${langs}${fw}\n`);
    const ok = await session.confirm('  Correct?', true);
    if (!ok) {
      const answer = await session.readText('  Describe your stack (e.g. "React + Node.js", "Kotlin Android"): ');
      return { languages: [answer], frameworks: [], signals: [] };
    }
  } else {
    const answer = await session.readText('  Describe your stack (e.g. "React + Node.js", "Kotlin Android"): ');
    return { languages: [answer], frameworks: [], signals: [] };
  }

  return project;
}

function stepHealthCheck(slotsUsed, installedNames) {
  if (slotsUsed <= SKILL_LIMIT) return;

  process.stdout.write('\n\u25ba Checking your setup...\n\n');
  process.stdout.write(`  \u26a0 You have ${slotsUsed} skills installed in ~/.claude/skills/\n\n`);
  process.stdout.write('  Claude loads all skills into its context window at startup.\n');
  process.stdout.write(`  With ${slotsUsed}, most get truncated \u2014 your agent misses key content.\n`);
  process.stdout.write('  Recommended: 10\u201320 skills matched to your project.\n\n');
  process.stdout.write('  After indexing, I\'ll find the best skills for your stack\n');
  process.stdout.write('  and help you clean up the rest.\n');
}

async function stepToolSelection(session, cwd) {
  process.stdout.write('\n\u25ba Which AI tools do you use?\n\n');

  const detector = new AgentDetector({ cwd });
  const detected = detector.detect();
  const detectedSet = new Set(detected);

  for (const a of detected) {
    process.stdout.write(`  \u2713 ${AGENT_LABELS[a] ?? a} (detected)\n`);
  }

  const undetected = ALL_AGENTS.filter(a => !detectedSet.has(a));
  if (undetected.length > 0) {
    process.stdout.write('\n  Also available:\n');
    undetected.forEach((a, i) => {
      process.stdout.write(`  ${i + 1}. ${AGENT_LABELS[a] ?? a}\n`);
    });
    const picks = await session.numberedInput(
      `\n  Enter numbers to add (e.g. 1,3) or Enter to skip: `,
      undetected.length,
    );
    for (const idx of picks) {
      detected.push(undetected[idx]);
    }
  }

  process.stdout.write(`\n  Selected: ${detected.map(a => AGENT_LABELS[a] ?? a).join(', ')}\n`);

  // Save to config
  try {
    const { configPath } = resolveBookLibPaths(cwd);
    let savedConfig = {};
    try { savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { /* no config */ }
    savedConfig.tools = detected;
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(savedConfig, null, 2));
  } catch { /* best-effort */ }

  const integrations = detectIntegrations({ cwd });
  if (integrations.superpowers) {
    process.stdout.write('  Detected: obra/superpowers plugin (skills auto-synced)\n');
  }

  return detected;
}

async function stepIndexBuild() {
  process.stdout.write('\n\u25ba Building knowledge index...\n');
  const indexer = new BookLibIndexer();

  try {
    const { skillsPath } = resolveBookLibPaths();
    await indexer.indexDirectory(skillsPath, false, {
      quiet: true,
      onProgress({ current, total, file }) {
        const name = file.split('/')[0]?.replace('/SKILL.md', '') ?? file;
        process.stdout.write(`\r  [${current}/${total}] ${name.padEnd(30)}`);
      },
    });
    process.stdout.write('\r' + ' '.repeat(60) + '\r');
    process.stdout.write('  \u2713 Index ready\n');
  } catch (err) {
    process.stdout.write(`\n  Index build failed: ${err.message}\n  Run "booklib index" manually.\n`);
  }
}

async function stepRecommendAndInstall(session, project, slotsUsed, installedNames) {
  process.stdout.write('\n\u25ba Finding best skills for your project...\n');

  const searcher = new BookLibSearcher();
  const queryText = project.languages.join(' ') + ' best practices';
  let results;
  try {
    results = await searcher.search(queryText, 20, 0);
  } catch {
    process.stdout.write('  Search index not available. Run "booklib index" first.\n');
    return [];
  }

  // Aggregate by skill name — multiple chunks may match the same skill
  const bySkill = new Map();
  for (const r of results) {
    const name = r.metadata?.name;
    if (!name) continue;
    if (!bySkill.has(name) || r.score > bySkill.get(name).score) {
      bySkill.set(name, { name, score: r.score, description: r.metadata?.description ?? '' });
    }
  }
  const recommended = [...bySkill.values()].sort((a, b) => b.score - a.score).slice(0, 10);

  if (recommended.length === 0) {
    process.stdout.write('  No matching skills found.\n');
    return [];
  }

  const installedSet = new Set(installedNames.map(n => n.toLowerCase()));

  // Show recommendations
  const choices = recommended.map(s => {
    const installed = installedSet.has(s.name.toLowerCase());
    const tag = installed ? ' (installed)' : '';
    return {
      label: s.name.padEnd(28) + `[${(s.score * 100).toFixed(0)}% match]${tag}`,
      description: s.description.slice(0, 60),
    };
  });

  const selected = await session.multiSelect(
    `\u25ba Top ${recommended.length} skills for your project:`,
    choices,
  );

  if (selected.length === 0) {
    process.stdout.write('  Skipped.\n');
    return installedNames;
  }

  // Install selected skills that aren't already installed
  const selectedNames = selected.map(i => recommended[i].name);
  const toInstall = selectedNames.filter(n => !installedSet.has(n.toLowerCase()));

  if (toInstall.length > 0) {
    process.stdout.write('\n\u25ba Installing skills...\n');
    for (const name of toInstall) {
      try {
        installBundledSkill(name);
        process.stdout.write(`  \u2713 ${name}\n`);
      } catch (err) {
        process.stdout.write(`  \u2717 ${name}: ${err.message}\n`);
      }
    }
  }

  // Cleanup offer — if way over limit
  if (slotsUsed > SKILL_LIMIT && selectedNames.length > 0) {
    const toRemove = installedNames.filter(n => !selectedNames.includes(n));
    process.stdout.write(`\n  You have ${slotsUsed} skills but only need ~${selectedNames.length} for this project.\n\n`);
    process.stdout.write('  [C] Clean up \u2014 keep only recommended (remove ' + toRemove.length + ' others)\n');
    process.stdout.write('  [K] Keep all + add recommended\n');
    process.stdout.write('  [S] Skip \u2014 I\'ll handle it manually\n\n');
    const answer = await session.readText('  > ');
    const choice = answer.toLowerCase();

    if (choice === 'c') {
      process.stdout.write('\n  Cleaning up...\n');
      const fetcher = new SkillFetcher();
      let removed = 0;
      for (const name of toRemove) {
        fetcher.desyncFromClaudeSkills({ name });
        removed++;
      }
      process.stdout.write(`  \u2713 Removed ${removed} skills. Kept ${selectedNames.length}.\n`);
    }
  }

  return selectedNames;
}

async function stepWriteConfigs(session, cwd, selectedAgents, skillNames) {
  if (selectedAgents.length === 0 || skillNames.length === 0) return;

  process.stdout.write('\n\u25ba Writing config files for your tools...\n');
  const initializer = new ProjectInitializer({ projectCwd: cwd });
  const target = selectedAgents.length === ALL_AGENTS.length ? 'all' : selectedAgents.join(',');

  try {
    const written = await initializer.init({ skills: skillNames, target, dryRun: false });
    if (written.length > 0) {
      for (const file of written) {
        process.stdout.write(`  \u2713 ${file}\n`);
      }
    }
  } catch (err) {
    process.stdout.write(`  \u26a0 ${err.message}\n`);
    process.stdout.write('  Run "booklib init --tool=claude" later to generate config files.\n');
  }

  const hasNonClaude = selectedAgents.some(a => a !== 'claude');
  if (hasNonClaude) {
    const mcp = await session.confirm('\n  Set up MCP server for live search from other tools?', false);
    if (mcp) {
      process.stdout.write('  Run: booklib mcp setup\n');
    }
  }
}

function printSummary(newSkillCount) {
  const slotsUsed = countInstalledSlots();

  console.log('');
  console.log('      \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u252c\u2500\u2500\u2500\u2500\u2500\u2500\u2510');
  console.log('      \u2502      \u2502      \u2502  BookLib is ready');
  console.log('      \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2518');
  console.log('');

  if (newSkillCount > 0) {
    process.stdout.write(`  \u2713 ${newSkillCount} new skill(s) added\n`);
  }
  process.stdout.write(`  \u2713 ${slotsUsed} skills loaded for your AI agent\n\n`);

  process.stdout.write(`  ${sep()}\n`);
  process.stdout.write('  Quick reference:\n\n');
  process.stdout.write('  booklib search "query"         find relevant patterns\n');
  process.stdout.write('  booklib search "q" --graph     include graph-linked skills\n');
  process.stdout.write('  booklib capture --title "..."   save a knowledge node\n');
  process.stdout.write('  booklib scan [dir]             project-wide analysis\n');
  process.stdout.write('  booklib audit <skill> <file>   deep-audit a file\n');
  process.stdout.write('  booklib doctor                 check skill health\n');
  process.stdout.write('  booklib list                   see installed skills\n');
  process.stdout.write('  booklib init --tool=cursor     add another AI tool\n');
  process.stdout.write(`  ${sep()}\n\n`);
}

// ── Re-run flow (already initialized) ────────────────────────────────────────

// Keep existing runRelevanceAudit unchanged — import cosine and getEmbeddings
// only for the re-run path to avoid loading them during first-run setup.
async function runRelevanceAudit(cwd) {
  const { cosine } = await import('./skill-recommender.js');
  const { getEmbeddings } = await import('./registry-embeddings.js');
  const { detect: detectProj } = await import('./project-detector.js');

  console.log('\n  BookLib \u2014 Relevance Check\n');

  const project = detectProj(cwd);
  const installedNames = listInstalledSkillNames();

  if (installedNames.length === 0) {
    console.log('  No BookLib-managed skills installed. Run "booklib init" to set up.');
    return;
  }

  process.stdout.write(`\u25ba Scoring ${installedNames.length} skill(s) against your project`);
  const dotInterval = setInterval(() => { process.stdout.write('.'); }, 300);

  const embeddings = await getEmbeddings();
  const searcher = new BookLibSearcher();
  const queryText = project.languages.map(l => `${l} programming`).join('. ') || 'software engineering';
  const queryVec = await searcher.getEmbedding(queryText);

  clearInterval(dotInterval);
  process.stdout.write('\n\n');

  const RELEVANCE_THRESHOLD = 0.35;
  const scored = installedNames
    .map(name => ({ name, score: embeddings.has(name) ? cosine(queryVec, embeddings.get(name)) : null }))
    .filter(s => s.score !== null)
    .sort((a, b) => b.score - a.score);

  const unindexedCount = installedNames.length - scored.length;
  if (unindexedCount > 0) {
    process.stdout.write(`  ${unindexedCount} skill(s) not yet indexed \u2014 run "booklib index" to score them\n\n`);
  }

  if (scored.length === 0) {
    process.stdout.write('  Nothing to score yet. Run "booklib index" first.\n\n');
    return;
  }

  const relevant = scored.filter(s => s.score >= RELEVANCE_THRESHOLD);
  const lowRelevance = scored.filter(s => s.score < RELEVANCE_THRESHOLD);

  for (const { name, score } of relevant.slice(0, 5)) {
    process.stdout.write(`  \u2713 ${name.padEnd(30)} ${(score * 100).toFixed(0)}% match\n`);
  }
  if (relevant.length > 5) {
    process.stdout.write(`  \u2026 and ${relevant.length - 5} more relevant skill(s)\n`);
  }

  if (lowRelevance.length === 0) {
    process.stdout.write(`\n  All ${scored.length} scored skill(s) are relevant to this project.\n\n`);
    return;
  }

  process.stdout.write('\n  Low relevance for this project:\n');
  for (const { name, score } of lowRelevance.slice(0, 10)) {
    process.stdout.write(`  \u00b7 ${name.padEnd(30)} ${(score * 100).toFixed(0)}% match\n`);
  }
  if (lowRelevance.length > 10) {
    process.stdout.write(`  \u2026 and ${lowRelevance.length - 10} more\n`);
  }

  process.stdout.write('\n  Tip: run "booklib uninstall <skill>" to free slots for more relevant skills.\n\n');
}
```

- [ ] **Step 2: Verify module loads**

Run: `node -e "import('./lib/wizard/index.js').then(() => console.log('OK'))"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add lib/wizard/index.js
git commit -m "feat(wizard): full rewrite — index-first flow, health check, cleanup, banner"
```

---

## Task 5: Smoke test end-to-end

- [ ] **Step 1: Clear test project and run wizard**

```bash
rm -rf /path/to/webshop/.booklib
cd /path/to/webshop
booklib init
```

Verify:
- ASCII book banner appears
- Project detection asks "What are you building?"
- Health check warns about 200+ skills and promises cleanup
- Tool selection shows detected agents + numbered list for adding more
- Index build shows `[47/249] effective-kotlin...` progress counter
- Recommendations come from the search index (relevant to user input)
- Cleanup option appears: [C] Clean up / [K] Keep all / [S] Skip
- Config files are written to the project
- Summary shows book banner and command reference

- [ ] **Step 2: Run all tests**

```bash
node --test tests/agent-detector.test.js tests/wizard/prompt-session.test.js tests/engine/indexer-bm25.test.js
```

Expected: all PASS

- [ ] **Step 3: Commit any fixes from smoke test**
