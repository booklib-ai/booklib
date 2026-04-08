# MCP-Only Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace BookLib's 20-30 line text dumps in agent config files with: MCP server registration + one line pointing to `booklib-mcp-guide` skill + hooks. Remove the profile template system, instinct blocks, and skills tables.

**Architecture:** The wizard's "wiring" step changes from `ProjectInitializer.init()` (renders profiles + instinct blocks into config files) to a new lightweight function that: (1) writes MCP config per tool, (2) writes one BookLib line to agent instruction files, (3) cleans up old markers, (4) installs hooks for Claude Code, (5) installs `booklib-mcp-guide` skill. The `mcp-config-writer.js` stays unchanged. `project-initializer.js` gets a new `initMCPOnly()` method that replaces the old `init()` flow.

**Tech Stack:** Node.js, ES modules, `@clack/prompts` (wizard), `gray-matter` (frontmatter)

---

### Task 1: Add `writeAgentLine()` to project-initializer

**Files:**
- Modify: `lib/project-initializer.js`
- Test: `tests/project-initializer-mcp-only.test.js`

The new function writes exactly one line to each tool's instruction file, handles three cases (new file, existing with markers, existing without), and creates a skeleton for new files.

- [ ] **Step 1: Write the failing tests**

Create `tests/project-initializer-mcp-only.test.js`:

```javascript
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BOOKLIB_LINE = 'BookLib: knowledge tools for this project. Read skills/booklib-mcp-guide/SKILL.md before first use.';

describe('writeAgentLine', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-agentline-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates new file with skeleton + BookLib line when file does not exist', async () => {
    const { writeAgentLine } = await import('../../lib/project-initializer.js');
    const filePath = path.join(tmpDir, 'CLAUDE.md');
    writeAgentLine(filePath, { skeleton: true });
    const content = fs.readFileSync(filePath, 'utf8');
    assert.ok(content.includes(BOOKLIB_LINE), 'should include BookLib line');
    assert.ok(content.includes('## Stack'), 'skeleton should have Stack section');
    assert.ok(content.includes('## Commands'), 'skeleton should have Commands section');
  });

  it('appends BookLib line to existing file without markers', async () => {
    const { writeAgentLine } = await import('../../lib/project-initializer.js');
    const filePath = path.join(tmpDir, 'CLAUDE.md');
    fs.writeFileSync(filePath, '# My Project\n\nCustom instructions here.\n');
    writeAgentLine(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    assert.ok(content.startsWith('# My Project'), 'should preserve existing content');
    assert.ok(content.includes('Custom instructions here.'), 'should preserve existing content');
    assert.ok(content.includes(BOOKLIB_LINE), 'should append BookLib line');
  });

  it('cleans up old markers and adds BookLib line', async () => {
    const { writeAgentLine } = await import('../../lib/project-initializer.js');
    const filePath = path.join(tmpDir, 'CLAUDE.md');
    fs.writeFileSync(filePath, '# My Project\n\n<!-- booklib-standards-start -->\n## Old stuff\nLots of dumped content\n<!-- booklib-standards-end -->\n\n## My Section\n');
    writeAgentLine(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    assert.ok(!content.includes('booklib-standards-start'), 'should remove old markers');
    assert.ok(!content.includes('Old stuff'), 'should remove old content');
    assert.ok(content.includes('# My Project'), 'should preserve content before markers');
    assert.ok(content.includes('## My Section'), 'should preserve content after markers');
    assert.ok(content.includes(BOOKLIB_LINE), 'should add BookLib line');
  });

  it('does nothing when BookLib line already present', async () => {
    const { writeAgentLine } = await import('../../lib/project-initializer.js');
    const filePath = path.join(tmpDir, 'CLAUDE.md');
    const original = `# My Project\n\n${BOOKLIB_LINE}\n`;
    fs.writeFileSync(filePath, original);
    writeAgentLine(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const count = (content.match(/booklib-mcp-guide/g) || []).length;
    assert.equal(count, 1, 'should not duplicate BookLib line');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/project-initializer-mcp-only.test.js`
Expected: FAIL — `writeAgentLine` is not exported

- [ ] **Step 3: Implement `writeAgentLine()`**

Add to `lib/project-initializer.js` (as an exported function, outside the class):

```javascript
const BOOKLIB_LINE = 'BookLib: knowledge tools for this project. Read skills/booklib-mcp-guide/SKILL.md before first use.';
const MARKER_START = '<!-- booklib-standards-start -->';
const MARKER_RE = /<!-- booklib-standards-start -->[\s\S]*?<!-- booklib-standards-end -->\n*/;

const SKELETON = `# Project

## Stack
<!-- describe your tech stack -->

## Commands
<!-- build, test, lint commands -->

## Conventions
<!-- coding standards, naming, patterns -->

## Architecture
<!-- key decisions and rationale -->

`;

export function writeAgentLine(filePath, opts = {}) {
  const { skeleton = false } = opts;

  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const content = skeleton ? SKELETON + BOOKLIB_LINE + '\n' : BOOKLIB_LINE + '\n';
    fs.writeFileSync(filePath, content);
    return 'created';
  }

  let content = fs.readFileSync(filePath, 'utf8');

  // Already has the line — skip
  if (content.includes('booklib-mcp-guide')) return 'skipped';

  // Clean up old markers
  if (content.includes(MARKER_START)) {
    content = content.replace(MARKER_RE, '');
  }

  // Append the line
  content = content.trimEnd() + '\n\n' + BOOKLIB_LINE + '\n';
  fs.writeFileSync(filePath, content);
  return 'updated';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/project-initializer-mcp-only.test.js`
Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
git add lib/project-initializer.js tests/project-initializer-mcp-only.test.js
git commit -m "feat: add writeAgentLine() — one line per agent config file"
```

---

### Task 2: Update wizard to use MCP-only wiring

**Files:**
- Modify: `lib/wizard/index.js:765-819` (the "wiring" step)

The wizard currently does three separate things: `ProjectInitializer.init()`, `writeMCPConfig()`, and `writeClaudeHooks()`. Replace the first with `writeAgentLine()` per tool.

- [ ] **Step 1: Read the current wiring code**

Read `lib/wizard/index.js` lines 765-819 to understand the current flow.

- [ ] **Step 2: Replace the wiring step**

Replace the section from `// Write config files` through `// Write Claude Code hooks` (lines 765-819) with:

```javascript
  // Wire up: MCP registration + one-line agent config + hooks
  const s = ui.spinner();
  s.start('Wiring everything up...');

  const wired = [];
  for (const tool of selectedAgents) {
    // 1. MCP registration
    if (MCP_CAPABLE.has(tool)) {
      try {
        const mcpPath = writeMCPConfig(tool, cwd);
        if (mcpPath) wired.push(`${tool}: MCP registered`);
      } catch { /* best-effort */ }
    }

    // 2. One line in agent instruction file
    const mapping = TOOL_FILE_MAP[tool];
    if (mapping) {
      try {
        const absPath = path.join(cwd, mapping.filePath);
        const isNew = !fs.existsSync(absPath);
        writeAgentLine(absPath, { skeleton: isNew });
        wired.push(mapping.filePath);
      } catch { /* best-effort */ }
    }
  }

  // 3. Hooks for Claude Code
  if (selectedAgents.includes('claude')) {
    try {
      const hookResult = writeClaudeHooks(cwd);
      if (hookResult) wired.push(`${path.relative(cwd, hookResult)} (hooks)`);
    } catch { /* best-effort */ }
  }

  // 4. Gitignore
  const gitignoreAdded = ensureBooklibGitignore(cwd);
  if (gitignoreAdded.length > 0) wired.push(`.gitignore (${gitignoreAdded.length} entries)`);

  if (wired.length > 0) {
    s.stop('Everything wired up');
    for (const w of wired) ui.log.success(w);
  } else {
    s.stop('Already configured');
  }
```

- [ ] **Step 3: Add imports**

At the top of `lib/wizard/index.js`, add:
```javascript
import { writeAgentLine } from '../project-initializer.js';
```

Also need `TOOL_FILE_MAP` — either export it from `project-initializer.js` or define a simplified version in the wizard. The simplified version only needs the instruction file paths (not fileHeader):

```javascript
const AGENT_INSTRUCTION_FILES = {
  claude:     'CLAUDE.md',
  cursor:     '.cursor/rules/booklib.mdc',
  copilot:    '.github/copilot-instructions.md',
  gemini:     '.gemini/context.md',
  codex:      'AGENTS.md',
  windsurf:   '.windsurfrules',
  'roo-code': '.roo/rules/booklib.md',
  openhands:  '.openhands/instructions.md',
  junie:      '.junie/guidelines.md',
  goose:      '.goose/context.md',
  opencode:   '.opencode/instructions.md',
  letta:      '.letta/skills/booklib.md',
};
```

- [ ] **Step 4: Remove old ProjectInitializer import usage**

Remove the `ProjectInitializer` usage from the wiring section. Keep the import if it's used elsewhere in the wizard, remove it if not.

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: 760 pass, 0 fail

- [ ] **Step 6: Commit**

```bash
git add lib/wizard/index.js
git commit -m "feat(wizard): replace content dumping with MCP-only wiring"
```

---

### Task 3: Simplify instinct block to CLI-only

**Files:**
- Modify: `lib/instinct-block.js`
- Modify: `tests/instinct-block.test.js`

The MCP branch is no longer needed — MCP tools are discovered via protocol, not text. Keep only the CLI fallback for non-MCP tools.

- [ ] **Step 1: Update the test**

Replace `tests/instinct-block.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderInstinctBlock } from '../lib/instinct-block.js';

test('MCP-capable tool returns null (no text instructions needed)', () => {
  const block = renderInstinctBlock('claude');
  assert.equal(block, null, 'MCP tools should not get text instructions');
});

test('non-MCP tool gets CLI commands', () => {
  const block = renderInstinctBlock('junie');
  assert.ok(block.includes('booklib search'), 'should reference CLI command');
  assert.ok(block.includes('booklib capture'), 'should reference capture command');
});

test('all MCP tools return null', () => {
  for (const tool of ['claude', 'cursor', 'copilot', 'gemini', 'codex', 'windsurf', 'roo-code', 'goose', 'zed', 'continue']) {
    assert.equal(renderInstinctBlock(tool), null, `${tool} should return null`);
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/instinct-block.test.js`
Expected: FAIL — renderInstinctBlock still returns text for MCP tools

- [ ] **Step 3: Simplify `renderInstinctBlock()`**

Replace `lib/instinct-block.js`:

```javascript
/**
 * Returns CLI command instructions for non-MCP tools.
 * MCP-capable tools return null — they discover BookLib via MCP protocol.
 *
 * @param {string} target - Tool target (claude, cursor, junie, etc.)
 * @returns {string|null} Markdown block for non-MCP tools, null for MCP tools
 */

const MCP_TOOLS = new Set([
  'claude', 'cursor', 'copilot', 'gemini', 'codex',
  'windsurf', 'roo-code', 'goose', 'zed', 'continue',
]);

export function renderInstinctBlock(target) {
  if (MCP_TOOLS.has(target)) return null;

  return `## BookLib
Run \`booklib search "query"\` for relevant principles.
Run \`booklib capture --title "..." --type decision\` to save knowledge.
Run \`booklib doctor\` for health check.`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/instinct-block.test.js`
Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add lib/instinct-block.js tests/instinct-block.test.js
git commit -m "refactor: instinct block returns null for MCP tools — discovery via protocol"
```

---

### Task 4: Clean up BookLib's own repo config files

**Files:**
- Modify: `CLAUDE.md`
- Modify: `.kiro/steering/booklib-standards.md`
- Modify: `.gemini/context.md`
- Modify: `.github/copilot-instructions.md`
- Modify: `SETUP.md`
- Modify: `BOOKLIB_SETUP_SUMMARY.md`

Replace BookLib-generated content in all these files with the one line. For CLAUDE.md, since this is BookLib's own repo, keep project-specific content (Stack, Commands) that helps developers working on BookLib itself.

- [ ] **Step 1: Replace CLAUDE.md**

```markdown
# BookLib

## Stack
javascript (Node.js >= 18, ES modules)

## Commands
- Install: `npm install`
- Test: `npm test`
- Build index: `booklib index`
- Health check: `booklib doctor`

BookLib: knowledge tools for this project. Read skills/booklib-mcp-guide/SKILL.md before first use.
```

- [ ] **Step 2: Replace `.kiro/steering/booklib-standards.md`**

Keep the `inclusion: always` frontmatter, replace body:

```markdown
---
inclusion: always
---
BookLib: knowledge tools for this project. Read skills/booklib-mcp-guide/SKILL.md before first use.
```

- [ ] **Step 3: Update `.gemini/context.md`**

Remove the BookLib section (everything from `## BookLib Agent Behaviors` to `## Active Skills` table). Add one line at the end:

```markdown
BookLib: knowledge tools for this project. Read skills/booklib-mcp-guide/SKILL.md before first use.
```

- [ ] **Step 4: Update `.github/copilot-instructions.md`**

Same as Step 3 — remove BookLib section, add one line.

- [ ] **Step 5: Update `SETUP.md`**

Replace the MCP tool list with:
```
BookLib integrates via MCP. Run `booklib init` to register.
Tools available: lookup, review, remember, verify, guard.
See skills/booklib-mcp-guide/SKILL.md for usage guide.
```

- [ ] **Step 6: Update `BOOKLIB_SETUP_SUMMARY.md`**

Same approach — slim to essential info + pointer to skill.

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md .kiro/steering/booklib-standards.md .gemini/context.md .github/copilot-instructions.md SETUP.md BOOKLIB_SETUP_SUMMARY.md
git commit -m "chore: replace content dumps with one-line BookLib pointers in all agent configs"
```

---

### Task 5: Remove profile template system

**Files:**
- Delete: `lib/profiles/software-development.md`
- Delete: `lib/profiles/writing-content.md`
- Delete: `lib/profiles/research-analysis.md`
- Delete: `lib/profiles/design.md`
- Delete: `lib/profiles/general.md`
- Modify: `lib/project-initializer.js` — remove `_loadProfile()`, `_renderFromProfile()`, `_buildSkillTable()`, `_getAgentBehaviors()`, `_getReferences()`

- [ ] **Step 1: Delete profile template files**

```bash
rm lib/profiles/software-development.md lib/profiles/writing-content.md lib/profiles/research-analysis.md lib/profiles/design.md lib/profiles/general.md
rmdir lib/profiles
```

- [ ] **Step 2: Remove dead methods from ProjectInitializer**

In `lib/project-initializer.js`, remove these methods:
- `_loadProfile()` (lines 259-265)
- `_renderFromProfile()` (lines 276-285)
- `_buildSkillTable()` (lines 231-250)
- `_getAgentBehaviors()` (lines 294-296)
- `_getReferences()` (lines 304-311)

Also remove the `import { renderInstinctBlock }` at the top if no longer used.

Keep `_extractBlocks()`, `_render()`, and `_findSkillFile()` for backward compatibility with `legacy: true` mode. Or if nothing uses legacy mode anymore, remove those too.

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All pass. Some old tests in `tests/project-initializer-new-agents.test.js` may need updating if they test profile rendering.

- [ ] **Step 4: Fix any failing tests**

If tests reference `_renderFromProfile` or profile templates, update them to test `writeAgentLine` instead.

- [ ] **Step 5: Commit**

```bash
git add -u lib/profiles/ lib/project-initializer.js tests/
git commit -m "refactor: remove profile template system — MCP-only config"
```

---

### Task 6: Run full validation

**Files:** None (read-only)

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 2: Test `booklib init` end-to-end**

Create a temp project and run:
```bash
mkdir /tmp/test-mcp-only && cd /tmp/test-mcp-only
npm init -y
booklib init
```

Verify:
- `.booklib/` directory created
- MCP config written (if tool detected)
- CLAUDE.md has only skeleton + one BookLib line (if claude selected)
- No instinct block, no skills table, no markers
- `booklib-mcp-guide` skill is searchable: `booklib search "booklib mcp tools"`

- [ ] **Step 3: Verify old project cleanup**

Create a file with old markers:
```bash
echo '# Old\n<!-- booklib-standards-start -->\nold content\n<!-- booklib-standards-end -->' > /tmp/test-mcp-only/CLAUDE.md
booklib init --reset
cat CLAUDE.md
```

Verify: old markers removed, BookLib line present.

- [ ] **Step 4: Commit any fixes**

If validation found issues, fix and commit.
