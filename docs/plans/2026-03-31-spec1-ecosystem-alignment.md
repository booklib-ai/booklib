# Spec 1 — Ecosystem Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make BookLib discoverable on skills.sh / agentskills.io, installable via `npx skillsadd`, auto-detected by URL, and compatible with 30+ agents instead of the current 8.

**Architecture:** Three independent pieces — (1) metadata additions to existing SKILL.md files, (2) a new `WellKnownBuilder` module + CLI command that generates the `/.well-known/skills/` index, (3) new agent writers in `ProjectInitializer` plus an `AgentDetector` module for auto-detection. All pieces are additive; nothing is removed or renamed.

**Tech Stack:** Node.js ESM, `node:test` + `assert/strict`, `gray-matter` (already in deps), no new dependencies.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `skills/*/SKILL.md` (23 files) | Add `version`, `tags`, `license` frontmatter |
| Create | `lib/well-known-builder.js` | Reads bundled skills, generates index skill.md |
| Create | `lib/agent-detector.js` | Detects which agents are installed on the machine |
| Modify | `lib/project-initializer.js` | New `_render()` cases + auto-detection via `AgentDetector` |
| Modify | `bin/booklib.js` | Register `build-wellknown` command |
| Create | `docs/.well-known/skills/default/skill.md` | Generated output (committed, updated by CI) |
| Create | `tests/well-known-builder.test.js` | Tests for WellKnownBuilder |
| Create | `tests/agent-detector.test.js` | Tests for AgentDetector |
| Create | `tests/project-initializer-new-agents.test.js` | Tests for new agent render cases |

---

## Task 1: Frontmatter compliance — add `version`, `tags`, `license` to all 23 SKILL.md files

**Files:**
- Modify: `skills/*/SKILL.md` (23 files)
- Create: `scripts/validate-frontmatter.js` (validation helper, run once)

- [ ] **Step 1: Write a validation script to identify missing fields**

Create `scripts/validate-frontmatter.js`:

```js
#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { fileURLToPath } from 'node:url';

const SKILLS_DIR = path.resolve(fileURLToPath(import.meta.url), '../../skills');
const REQUIRED = ['name', 'description', 'version', 'tags', 'license'];

let failures = 0;
for (const skill of fs.readdirSync(SKILLS_DIR)) {
  const file = path.join(SKILLS_DIR, skill, 'SKILL.md');
  if (!fs.existsSync(file)) continue;
  const { data } = matter(fs.readFileSync(file, 'utf8'));
  const missing = REQUIRED.filter(f => !data[f]);
  if (missing.length) {
    console.log(`MISSING in ${skill}: ${missing.join(', ')}`);
    failures++;
  }
}
if (failures === 0) console.log('All skills compliant.');
process.exit(failures > 0 ? 1 : 0);
```

- [ ] **Step 2: Run it to see current gaps**

```bash
node scripts/validate-frontmatter.js
```

Expected: lists all 23 skills as missing `version`, `tags`, `license`.

- [ ] **Step 3: Update each SKILL.md frontmatter block**

Add these three lines to the YAML frontmatter of every `skills/*/SKILL.md`. The values per skill:

| Skill | tags | version | license |
|-------|------|---------|---------|
| `animation-at-work` | `[design, animation, ui]` | `"1.0"` | `MIT` |
| `clean-code-reviewer` | `[all-languages, quality, naming, refactoring]` | `"1.0"` | `MIT` |
| `data-intensive-patterns` | `[architecture, databases, distributed-systems]` | `"1.0"` | `MIT` |
| `data-pipelines` | `[data, etl, pipelines, python]` | `"1.0"` | `MIT` |
| `design-patterns` | `[patterns, oop, architecture]` | `"1.0"` | `MIT` |
| `domain-driven-design` | `[architecture, ddd, modeling]` | `"1.0"` | `MIT` |
| `effective-java` | `[java, jvm, oop]` | `"1.0"` | `MIT` |
| `effective-kotlin` | `[kotlin, jvm, oop]` | `"1.0"` | `MIT` |
| `effective-python` | `[python, oop, idioms]` | `"1.0"` | `MIT` |
| `effective-typescript` | `[typescript, javascript, types]` | `"1.0"` | `MIT` |
| `kotlin-in-action` | `[kotlin, jvm]` | `"1.0"` | `MIT` |
| `lean-startup` | `[product, strategy, entrepreneurship]` | `"1.0"` | `MIT` |
| `microservices-patterns` | `[microservices, architecture, distributed-systems]` | `"1.0"` | `MIT` |
| `programming-with-rust` | `[rust, systems-programming]` | `"1.0"` | `MIT` |
| `refactoring-ui` | `[ui, design, css, frontend]` | `"1.0"` | `MIT` |
| `rust-in-action` | `[rust, systems-programming]` | `"1.0"` | `MIT` |
| `skill-router` | `[meta, routing, agent-skills]` | `"1.0"` | `MIT` |
| `spring-boot-in-action` | `[java, spring, backend]` | `"1.0"` | `MIT` |
| `storytelling-with-data` | `[data-visualization, communication, design]` | `"1.0"` | `MIT` |
| `system-design-interview` | `[architecture, distributed-systems, scalability]` | `"1.0"` | `MIT` |
| `using-asyncio-python` | `[python, async, concurrency]` | `"1.0"` | `MIT` |
| `web-scraping-python` | `[python, web-scraping, data]` | `"1.0"` | `MIT` |
| `writing-plans` | `[planning, documentation, process]` | `"1.0"` | `MIT` |

Example result for `skills/effective-kotlin/SKILL.md`:

```yaml
---
name: effective-kotlin
version: "1.0"
license: MIT
tags: [kotlin, jvm, oop]
description: >
  Apply Effective Kotlin best practices ...
---
```

- [ ] **Step 4: Run validation to confirm compliance**

```bash
node scripts/validate-frontmatter.js
```

Expected: `All skills compliant.`

- [ ] **Step 5: Commit**

```bash
git add skills/ scripts/validate-frontmatter.js
git commit -m "feat(ecosystem): add version, tags, license to all 23 SKILL.md files"
```

---

## Task 2: WellKnownBuilder module + `booklib build-wellknown` command

**Files:**
- Create: `lib/well-known-builder.js`
- Create: `tests/well-known-builder.test.js`
- Modify: `bin/booklib.js` (register command)
- Create: `docs/.well-known/skills/default/skill.md` (generated output)

- [ ] **Step 1: Write the failing test**

Create `tests/well-known-builder.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WellKnownBuilder } from '../lib/well-known-builder.js';

function tmpDir() {
  return mkdtempSync(path.join(tmpdir(), 'booklib-wk-test-'));
}

test('generates skill.md at correct path', async () => {
  const outDir = tmpDir();
  const builder = new WellKnownBuilder({ outDir });
  const outPath = await builder.build();
  assert.ok(existsSync(outPath), `Expected file at ${outPath}`);
  rmSync(outDir, { recursive: true });
});

test('generated skill.md has valid frontmatter', async () => {
  const outDir = tmpDir();
  const builder = new WellKnownBuilder({ outDir });
  const outPath = await builder.build();
  const content = readFileSync(outPath, 'utf8');
  assert.ok(content.startsWith('---'), 'Missing frontmatter opening');
  assert.ok(content.includes('name: booklib-skills'), 'Missing name field');
  assert.ok(content.includes('description:'), 'Missing description field');
  rmSync(outDir, { recursive: true });
});

test('generated skill.md lists all bundled skills', async () => {
  const outDir = tmpDir();
  const builder = new WellKnownBuilder({ outDir });
  const outPath = await builder.build();
  const content = readFileSync(outPath, 'utf8');
  assert.ok(content.includes('effective-kotlin'), 'Missing effective-kotlin entry');
  assert.ok(content.includes('effective-python'), 'Missing effective-python entry');
  assert.ok(content.includes('clean-code-reviewer'), 'Missing clean-code-reviewer entry');
  rmSync(outDir, { recursive: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/well-known-builder.test.js
```

Expected: FAIL — `Cannot find module '../lib/well-known-builder.js'`

- [ ] **Step 3: Implement `lib/well-known-builder.js`**

```js
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const BUNDLED_SKILLS_DIR = path.join(PACKAGE_ROOT, 'skills');
const DEFAULT_OUT = path.join(PACKAGE_ROOT, 'docs', '.well-known', 'skills', 'default');

export class WellKnownBuilder {
  constructor({ outDir = DEFAULT_OUT } = {}) {
    this.outDir = outDir;
  }

  async build() {
    const skills = this._readBundledSkills();
    const content = this._render(skills);
    fs.mkdirSync(this.outDir, { recursive: true });
    const outPath = path.join(this.outDir, 'skill.md');
    fs.writeFileSync(outPath, content);
    return outPath;
  }

  _readBundledSkills() {
    return fs.readdirSync(BUNDLED_SKILLS_DIR)
      .map(name => {
        const file = path.join(BUNDLED_SKILLS_DIR, name, 'SKILL.md');
        if (!fs.existsSync(file)) return null;
        const { data } = matter(fs.readFileSync(file, 'utf8'));
        return { name: data.name ?? name, description: data.description ?? '', tags: data.tags ?? [] };
      })
      .filter(Boolean);
  }

  _render(skills) {
    const list = skills
      .map(s => `- **${s.name}**: ${String(s.description).replace(/\s+/g, ' ').slice(0, 120)}`)
      .join('\n');

    return `---
name: booklib-skills
description: >
  BookLib — curated skills from canonical programming books. Covers Kotlin,
  Python, Java, TypeScript, Rust, architecture, DDD, data-intensive systems,
  UI design, and more. Install individual skills via npx skillsadd booklib-ai/skills/<name>.
version: "1.0"
license: MIT
tags: [books, knowledge, all-languages, architecture, best-practices]
---

# BookLib Skills

Book knowledge distilled into structured AI skills. Install any skill with:

\`\`\`
npx skillsadd booklib-ai/skills/<skill-name>
\`\`\`

## Available Skills

${list}

## Install Everything

\`\`\`bash
npm install -g @booklib/skills && booklib init
\`\`\`
`;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/well-known-builder.test.js
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Register `build-wellknown` command in `bin/booklib.js`**

Add this import near the top of `bin/booklib.js` (after the existing imports):

```js
import { WellKnownBuilder } from '../lib/well-known-builder.js';
```

Add this case in the command switch/if block (follow the same pattern as existing commands):

```js
if (command === 'build-wellknown') {
  const builder = new WellKnownBuilder();
  const outPath = await builder.build();
  console.log(`Generated: ${outPath}`);
  process.exit(0);
}
```

- [ ] **Step 6: Generate and commit the output file**

```bash
node bin/booklib.js build-wellknown
```

Expected output: `Generated: .../docs/.well-known/skills/default/skill.md`

```bash
git add lib/well-known-builder.js tests/well-known-builder.test.js \
        bin/booklib.js docs/.well-known/
git commit -m "feat(ecosystem): add WellKnownBuilder and booklib build-wellknown command"
```

---

## Task 3: New agent writers in ProjectInitializer

**Files:**
- Modify: `lib/project-initializer.js` — add 6 new `_render()` cases + extend `ALL_TARGETS`
- Create: `tests/project-initializer-new-agents.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/project-initializer-new-agents.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ProjectInitializer } from '../lib/project-initializer.js';

function tmpDir() {
  return mkdtempSync(path.join(tmpdir(), 'booklib-init-test-'));
}

const NEW_AGENTS = [
  { target: 'roo-code',   file: '.roo/rules/booklib-standards.md' },
  { target: 'openhands',  file: '.openhands/instructions.md' },
  { target: 'junie',      file: '.junie/guidelines.md' },
  { target: 'goose',      file: '.goose/context.md' },
  { target: 'opencode',   file: '.opencode/instructions.md' },
  { target: 'letta',      file: '.letta/skills/booklib.md' },
];

for (const { target, file } of NEW_AGENTS) {
  test(`${target}: writes to ${file}`, async () => {
    const cwd = tmpDir();
    const init = new ProjectInitializer({ projectCwd: cwd });
    await init.init({ skills: ['effective-kotlin'], target });
    assert.ok(existsSync(path.join(cwd, file)), `Missing ${file}`);
    rmSync(cwd, { recursive: true });
  });

  test(`${target}: written file contains booklib marker`, async () => {
    const cwd = tmpDir();
    const init = new ProjectInitializer({ projectCwd: cwd });
    await init.init({ skills: ['effective-kotlin'], target });
    const content = readFileSync(path.join(cwd, file), 'utf8');
    assert.ok(content.includes('booklib-standards-start'), `Missing marker in ${file}`);
    rmSync(cwd, { recursive: true });
  });
}

test('ALL_TARGETS includes all new agents', async () => {
  const cwd = tmpDir();
  const init = new ProjectInitializer({ projectCwd: cwd });
  const written = await init.init({ skills: ['effective-kotlin'], target: 'all' });
  for (const { file } of NEW_AGENTS) {
    assert.ok(written.includes(file), `all target missed ${file}`);
  }
  rmSync(cwd, { recursive: true });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test tests/project-initializer-new-agents.test.js
```

Expected: FAIL — files not written for new targets.

- [ ] **Step 3: Extend `ALL_TARGETS` in `lib/project-initializer.js`**

Find the line:
```js
const ALL_TARGETS = ['claude', 'cursor', 'copilot', 'gemini', 'codex', 'windsurf'];
```

Replace with:
```js
const ALL_TARGETS = [
  'claude', 'cursor', 'copilot', 'gemini', 'codex', 'windsurf',
  'roo-code', 'openhands', 'junie', 'goose', 'opencode', 'letta',
];
```

- [ ] **Step 4: Add 6 new cases to `_render()` in `lib/project-initializer.js`**

Add these cases to the `switch (target)` block, after the last existing case and before the `default`:

```js
case 'roo-code':
  return {
    filePath: '.roo/rules/booklib-standards.md',
    fileHeader: null,
    content: `<!-- booklib-standards-start -->
<!-- ${generated} -->

## Core Principles

${principles || '_No structured principles found in selected skills._'}

## Anti-Patterns

${antiPatterns || '_No anti-patterns found._'}
<!-- booklib-standards-end -->
`,
  };

case 'openhands':
  return {
    filePath: '.openhands/instructions.md',
    fileHeader: '# OpenHands Instructions\n\n',
    content: `<!-- booklib-standards-start -->
<!-- ${generated} -->

## Coding Standards

${principles || '_No structured principles found._'}

## What to Avoid

${antiPatterns || '_No anti-patterns found._'}
<!-- booklib-standards-end -->
`,
  };

case 'junie':
  return {
    filePath: '.junie/guidelines.md',
    fileHeader: '# Junie Guidelines\n\n',
    content: `<!-- booklib-standards-start -->
<!-- ${generated} -->

## Principles

${principles || '_No structured principles found._'}

## Anti-Patterns

${antiPatterns || '_No anti-patterns found._'}
<!-- booklib-standards-end -->
`,
  };

case 'goose':
  return {
    filePath: '.goose/context.md',
    fileHeader: '# Goose Context\n\n',
    content: `<!-- booklib-standards-start -->
<!-- ${generated} -->

## Standards

${principles || '_No structured principles found._'}

## Avoid

${antiPatterns || '_No anti-patterns found._'}
<!-- booklib-standards-end -->
`,
  };

case 'opencode':
  return {
    filePath: '.opencode/instructions.md',
    fileHeader: '# OpenCode Instructions\n\n',
    content: `<!-- booklib-standards-start -->
<!-- ${generated} -->

## Coding Standards

${principles || '_No structured principles found._'}

## Anti-Patterns

${antiPatterns || '_No anti-patterns found._'}
<!-- booklib-standards-end -->
`,
  };

case 'letta':
  return {
    filePath: '.letta/skills/booklib.md',
    fileHeader: null,
    content: `<!-- booklib-standards-start -->
<!-- ${generated} -->

# BookLib Knowledge

## Principles

${principles || '_No structured principles found._'}

## Anti-Patterns

${antiPatterns || '_No anti-patterns found._'}
<!-- booklib-standards-end -->
`,
  };
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
node --test tests/project-initializer-new-agents.test.js
```

Expected: all 13 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/project-initializer.js tests/project-initializer-new-agents.test.js
git commit -m "feat(ecosystem): add roo-code, openhands, junie, goose, opencode, letta agent writers"
```

---

## Task 4: AgentDetector + auto-detection in `booklib init`

**Files:**
- Create: `lib/agent-detector.js`
- Create: `tests/agent-detector.test.js`
- Modify: `lib/project-initializer.js` — use `AgentDetector` when target is `'auto'`
- Modify: `bin/booklib.js` — pass `target: 'auto'` when no `--target` flag given

- [ ] **Step 1: Write the failing tests**

Create `tests/agent-detector.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AgentDetector } from '../lib/agent-detector.js';

function tmpDir() {
  return mkdtempSync(path.join(tmpdir(), 'booklib-detect-test-'));
}

test('always detects claude', () => {
  const cwd = tmpDir();
  const detector = new AgentDetector({ cwd });
  const detected = detector.detect();
  assert.ok(detected.includes('claude'), 'claude should always be detected');
  rmSync(cwd, { recursive: true });
});

test('detects cursor when .cursor/ directory exists', () => {
  const cwd = tmpDir();
  mkdirSync(path.join(cwd, '.cursor'));
  const detector = new AgentDetector({ cwd });
  const detected = detector.detect();
  assert.ok(detected.includes('cursor'), 'cursor not detected from .cursor/');
  rmSync(cwd, { recursive: true });
});

test('detects roo-code when .roo/ directory exists', () => {
  const cwd = tmpDir();
  mkdirSync(path.join(cwd, '.roo'));
  const detector = new AgentDetector({ cwd });
  const detected = detector.detect();
  assert.ok(detected.includes('roo-code'), 'roo-code not detected from .roo/');
  rmSync(cwd, { recursive: true });
});

test('detects junie when .junie/ directory exists', () => {
  const cwd = tmpDir();
  mkdirSync(path.join(cwd, '.junie'));
  const detector = new AgentDetector({ cwd });
  const detected = detector.detect();
  assert.ok(detected.includes('junie'));
  rmSync(cwd, { recursive: true });
});

test('does not detect goose when no signals present', () => {
  const cwd = tmpDir();
  const detector = new AgentDetector({ cwd, checkPath: false });
  const detected = detector.detect();
  assert.ok(!detected.includes('goose'), 'goose falsely detected');
  rmSync(cwd, { recursive: true });
});

test('detects opencode when opencode.toml exists', () => {
  const cwd = tmpDir();
  writeFileSync(path.join(cwd, 'opencode.toml'), '');
  const detector = new AgentDetector({ cwd });
  const detected = detector.detect();
  assert.ok(detected.includes('opencode'));
  rmSync(cwd, { recursive: true });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test tests/agent-detector.test.js
```

Expected: FAIL — `Cannot find module '../lib/agent-detector.js'`

- [ ] **Step 3: Implement `lib/agent-detector.js`**

```js
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

/**
 * Detects which AI coding agents are present in the project or on $PATH.
 * Always returns at least ['claude'].
 */
export class AgentDetector {
  /**
   * @param {object} opts
   * @param {string}  [opts.cwd]       - project root to check for config dirs
   * @param {boolean} [opts.checkPath] - whether to check $PATH (default true)
   */
  constructor({ cwd = process.cwd(), checkPath = true } = {}) {
    this.cwd = cwd;
    this.checkPath = checkPath;
  }

  detect() {
    const found = new Set(['claude']); // always present

    const DIR_SIGNALS = {
      'cursor':    ['.cursor'],
      'roo-code':  ['.roo'],
      'openhands': ['.openhands'],
      'junie':     ['.junie'],
      'goose':     ['.goose'],
      'opencode':  [],   // detected by file below
      'letta':     ['.letta'],
      'windsurf':  ['.windsurf'],
      'gemini':    ['.gemini'],
    };

    const FILE_SIGNALS = {
      'opencode': ['opencode.toml'],
      'copilot':  ['.github/copilot-instructions.md'],
    };

    const PATH_SIGNALS = {
      'cursor':    'cursor',
      'codex':     'codex',
      'windsurf':  'windsurf',
      'gemini':    'gemini',
      'goose':     'goose',
      'opencode':  'opencode',
    };

    for (const [agent, dirs] of Object.entries(DIR_SIGNALS)) {
      if (dirs.some(d => fs.existsSync(path.join(this.cwd, d)))) {
        found.add(agent);
      }
    }

    for (const [agent, files] of Object.entries(FILE_SIGNALS)) {
      if (files.some(f => fs.existsSync(path.join(this.cwd, f)))) {
        found.add(agent);
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
      execSync(`which ${bin}`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test tests/agent-detector.test.js
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Wire auto-detection into `ProjectInitializer.init()`**

In `lib/project-initializer.js`, add this import at the top:

```js
import { AgentDetector } from './agent-detector.js';
```

In the `init()` method, replace the `const targets = ...` block:

```js
// Before:
const ALL_TARGETS = [...];
const targets = target === 'all'
  ? ALL_TARGETS
  : target.split(',').map(t => t.trim());

// After:
const ALL_TARGETS = [
  'claude', 'cursor', 'copilot', 'gemini', 'codex', 'windsurf',
  'roo-code', 'openhands', 'junie', 'goose', 'opencode', 'letta',
];
const targets = target === 'all'
  ? ALL_TARGETS
  : target === 'auto'
  ? new AgentDetector({ cwd: this.projectCwd }).detect()
  : target.split(',').map(t => t.trim());
```

- [ ] **Step 6: Change `booklib init` default target to `'auto'` in `bin/booklib.js`**

Find the `init` command handling in `bin/booklib.js`. Locate where `target` is read from flags (look for `parseFlag(args, 'target')`). Change the fallback default from `'all'` to `'auto'`:

```js
// Before (approximate — find the exact line):
const target = parseFlag(args, 'target') ?? 'all';

// After:
const target = parseFlag(args, 'target') ?? 'auto';
```

- [ ] **Step 7: Verify end-to-end in a temp directory**

```bash
mkdir /tmp/booklib-test-init && cd /tmp/booklib-test-init
node /path/to/skills/bin/booklib.js init --skills=effective-kotlin
```

Expected: prints `✅ CLAUDE.md` at minimum; prints additional agents if their config dirs exist.

- [ ] **Step 8: Commit**

```bash
git add lib/agent-detector.js lib/project-initializer.js \
        tests/agent-detector.test.js bin/booklib.js
git commit -m "feat(ecosystem): add AgentDetector and auto-detection in booklib init"
```

---

## Task 5: skills.sh directory submission (external action)

This task has no code changes. It is a manual submission to the skills.sh open directory.

- [ ] **Step 1: Verify repo layout matches skills.sh expectations**

```bash
# skills.sh expects: owner/repo with skills at skills/<skill-id>/SKILL.md
ls skills/ | head -5
# Should show: animation-at-work, clean-code-reviewer, ...
```

- [ ] **Step 2: Submit to skills.sh**

Open a PR to the skills.sh index repository (linked from [skills.sh](https://skills.sh/)) adding:

```
booklib-ai/skills
```

to their index. Follow the contribution guide in their repo. Each of the 23 bundled skills will appear on the leaderboard individually under `booklib-ai/skills/<skill-name>`.

- [ ] **Step 3: Add `npx skillsadd` usage to README.md**

In `README.md`, add to the Quick Start section:

```markdown
# Install a single skill via the open ecosystem
npx skillsadd booklib-ai/skills/effective-kotlin

# Or discover all BookLib skills
npx skills find booklib
```

- [ ] **Step 4: Commit README update**

```bash
git add README.md
git commit -m "docs: add npx skillsadd install instructions"
```

---

## Task 6: CI release hook for `build-wellknown`

**Files:**
- Modify: `.github/workflows/` (whichever workflow handles releases/publishes)

- [ ] **Step 1: Identify the release workflow**

```bash
ls .github/workflows/
```

- [ ] **Step 2: Add `build-wellknown` step before the publish/release step**

In the release workflow YAML, add this step immediately before the `npm publish` or release step:

```yaml
- name: Regenerate .well-known/skills index
  run: node bin/booklib.js build-wellknown

- name: Commit updated well-known index
  run: |
    git config user.name "github-actions[bot]"
    git config user.email "github-actions[bot]@users.noreply.github.com"
    git add docs/.well-known/
    git diff --staged --quiet || git commit -m "chore: regenerate .well-known/skills index [skip ci]"
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/
git commit -m "ci: regenerate .well-known/skills index on release"
```

---

## Self-Review Checklist

- [x] All 23 SKILL.md files covered in Task 1 tag table
- [x] `WellKnownBuilder` uses same `gray-matter` dep already in `package.json` — no new deps
- [x] `AgentDetector` exported name matches import in `project-initializer.js`
- [x] `ALL_TARGETS` extended in both Task 3 Step 3 and Task 4 Step 5 — same list, consistent
- [x] Test runner command is `node --test <file>` (confirmed from existing tests)
- [x] `_render()` new cases use same `generated`, `principles`, `antiPatterns` variables already in scope
- [x] Fallback when auto-detection finds nothing: `['claude']` — always returned by `AgentDetector`
- [x] Task 5 (skills.sh) is external — correctly marked as manual steps, no code
- [x] `build-wellknown` CI step runs before publish so the index is always fresh on release
