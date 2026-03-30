# Onboarding UX Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the four biggest drop-off points in the new-user experience so a developer can go from `npm install` to working knowledge graph context injection in under 10 minutes.

**Architecture:** Three code fixes (one message correction, one UX hint addition, one progress message) plus a README Quick Start rewrite. No new dependencies, no new files.

**Tech Stack:** Node.js ESM, `bin/booklib.js` (CLI), `lib/engine/indexer.js` (embedding pipeline), `README.md` (docs).

---

## Files

| File | Change |
|---|---|
| `bin/booklib.js` | Fix stale `research` message; add `--file` no-component hint |
| `lib/engine/indexer.js` | Add first-run model-download time warning |
| `README.md` | Rewrite Quick Start; fix link examples; add "Your first 5 minutes" section |

---

### Task 1: Fix stale "run booklib index" message after `booklib research`

**Problem:** `booklib research "topic"` already calls `autoIndexNode` (the node is immediately searchable), but the success message still says "run booklib index to update the search index." This tells users to do work that's already been done and makes the tool seem fragile.

**Files:**
- Modify: `bin/booklib.js` — `case 'research'` block (line ~929)
- Test: `tests/engine/graph.test.js`

- [ ] **Step 1: Write the failing test**

Add to `tests/engine/graph.test.js` (after the last `test(...)` block):

```js
test('research console output does not mention manual re-indexing', async (t) => {
  const { serializeNode, saveNode } = await import('../../lib/engine/graph.js');
  // Simulate what the research command does: create a research node with template content
  const id = 'node_research01';
  const template = `## Sources\n\n## Key Findings\n\n## Summary\n`;
  const content = serializeNode({ id, type: 'research', title: 'Test topic', content: template, confidence: 'low' });
  assert.ok(content.includes('type: research'), 'node has research type');
  assert.ok(content.includes('confidence: low'), 'node has low confidence');
  // The key assertion: the success messages should NOT tell user to manually re-run index
  const staleMessage = 'run booklib index to update the search index';
  // Read the actual source to verify the message was removed
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../bin/booklib.js', import.meta.url), 'utf8');
  assert.ok(!src.includes(staleMessage), 'stale re-index message removed from research case');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/engine/graph.test.js 2>&1 | grep -A 3 "research console"
```

Expected: FAIL — `stale re-index message removed from research case`

- [ ] **Step 3: Fix the message in `bin/booklib.js`**

Find `case 'research':` (line ~929). The current last two `console.log` lines are:

```js
console.log(`✅ Research template created: ${filePath}`);
console.log(`   ID: ${id}`);
console.log(`   Fill in the findings and run booklib index to update the search index.`);
```

Replace the third line:

```js
console.log(`✅ Research template created: ${filePath}`);
console.log(`   ID: ${id}`);
console.log(`   Fill in the findings — this node is already indexed and searchable.`);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/engine/graph.test.js 2>&1 | tail -6
```

Expected: all 24 tests pass (including the new one).

- [ ] **Step 5: Commit**

```bash
git add bin/booklib.js tests/engine/graph.test.js
git commit -m "fix: research success message no longer says to manually re-run index"
```

---

### Task 2: Add first-run model download time warning in indexer

**Problem:** The first call to `booklib index` triggers a ~25MB model download (Xenova/all-MiniLM-L6-v2) with no feedback. The only output is `Loading local embedding model...` followed by ~90 seconds of silence. New users assume it hung and Ctrl+C.

**Files:**
- Modify: `lib/engine/indexer.js` — `loadModel()` method (line ~22)

No unit test needed for a progress message (console output); we verify with a smoke test.

- [ ] **Step 1: Update `loadModel()` in `lib/engine/indexer.js`**

Find the `loadModel()` method (line ~22). Current:

```js
async loadModel() {
  if (!this.extractor) {
    console.log('Loading local embedding model (Xenova/all-MiniLM-L6-v2)...');
    this.extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
}
```

Replace with:

```js
async loadModel() {
  if (!this.extractor) {
    const indexExists = await this.index.isIndexCreated().catch(() => false);
    if (!indexExists) {
      console.log('First run: downloading embedding model (~25 MB, ~1 min)...');
    } else {
      console.log('Loading local embedding model...');
    }
    this.extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
}
```

The `isIndexCreated()` call is a cheap filesystem check — it just checks whether the index directory exists. On first run (index doesn't exist), users see the download warning. On subsequent runs, they see the shorter message.

- [ ] **Step 2: Verify the file has no syntax errors**

```bash
node --input-type=module --eval "
import('./lib/engine/indexer.js')
  .then(() => console.log('import OK'))
  .catch(e => { console.error(e.message); process.exit(1); });
"
```

Expected: `import OK` (no syntax errors).

- [ ] **Step 3: Commit**

```bash
git add lib/engine/indexer.js
git commit -m "fix: show download size and time warning on first booklib index run"
```

---

### Task 3: Add `--file` no-component hint when context injection is silent

**Problem:** `booklib context "task" --file src/auth/middleware.js` silently returns only skill context when no component maps to the file. The user sees no graph section and has no idea why — or even that graph injection exists.

**Fix:** After `buildWithGraph` returns, if `--file` was passed and the output doesn't contain "## Knowledge Graph Context", print a one-line hint to stderr explaining what to do.

**Files:**
- Modify: `bin/booklib.js` — `case 'context'` block (line ~169)

- [ ] **Step 1: Write the failing test**

Add to `tests/engine/graph.test.js`:

```js
test('context --file hint message is present in bin/booklib.js source', async (t) => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../bin/booklib.js', import.meta.url), 'utf8');
  assert.ok(
    src.includes('booklib component add'),
    'bin/booklib.js contains component hint for --file with no graph context'
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/engine/graph.test.js 2>&1 | grep -A 3 "component hint"
```

Expected: FAIL.

- [ ] **Step 3: Update `case 'context'` in `bin/booklib.js`**

Find the `case 'context':` block (line ~169). Current:

```js
const result = useGraph
  ? await builder.buildWithGraph(task, fileArg)
  : await builder.build(task, { promptOnly });
console.log(result);
```

Replace with:

```js
const result = useGraph
  ? await builder.buildWithGraph(task, fileArg)
  : await builder.build(task, { promptOnly });
console.log(result);

// If --file was passed but no knowledge graph context was injected, explain why
if (fileArg && useGraph && !result.includes('## Knowledge Graph Context')) {
  process.stderr.write(
    `\nTip: no component is mapped to "${fileArg}".\n` +
    `  To enable graph context injection: booklib component add <name> "<glob>"\n` +
    `  Example: booklib component add auth "src/auth/**"\n`
  );
}
```

- [ ] **Step 4: Run all tests**

```bash
node --test tests/engine/graph.test.js tests/engine/capture.test.js tests/engine/graph-injector.test.js 2>&1 | tail -6
```

Expected: all 25 tests pass.

- [ ] **Step 5: Smoke-test the hint**

```bash
# File with no matching component — should print the hint to stderr
node bin/booklib.js context "test task" --file src/auth/middleware.js 2>&1 | grep -A 3 "Tip:"
```

Expected:
```
Tip: no component is mapped to "src/auth/middleware.js".
  To enable graph context injection: booklib component add <name> "<glob>"
  Example: booklib component add auth "src/auth/**"
```

- [ ] **Step 6: Commit**

```bash
git add bin/booklib.js tests/engine/graph.test.js
git commit -m "feat: show component setup hint when --file produces no graph context"
```

---

### Task 4: Rewrite README Quick Start + add "Your first 5 minutes" guide

**Problem:** The current Quick Start lists 5 commands in order but:
1. Doesn't run `booklib init` (so Claude Code never connects to BookLib)
2. Doesn't warn about model download time
3. Never mentions knowledge graph at all
4. Uses old ID-based link examples that stopped working in v1.12
5. Has no guide that walks a new user to the first "aha moment" (graph context injection)

**Files:**
- Modify: `README.md` — Quick Start section (line ~66) and Knowledge Graph link examples (line ~262)

No tests for documentation changes; verify with grep.

- [ ] **Step 1: Replace the Quick Start section**

Find the `## Quick Start` section (line ~66) and replace it with:

````markdown
## Quick Start

```bash
# 1. Install
npm install -g @booklib/skills

# 2. Connect to your AI tool (writes CLAUDE.md, .cursor/rules/, copilot-instructions.md)
booklib init

# 3. Build the local search index
#    First run downloads a ~25 MB embedding model — takes about 1 minute.
booklib index

# 4. Install the PreToolUse hook — injects relevant skills when you edit files
booklib hooks install

# 5. Search for wisdom by concept
booklib search "how to handle null values in Kotlin"
```

**Using Cursor, Copilot, or Gemini?** `booklib init` writes the right context file for each tool automatically. For MCP-compatible editors, see [MCP Server](#mcp-server) below.

---

## Your First 5 Minutes with the Knowledge Graph

After the Quick Start, do this once to see BookLib's full power:

```bash
# 1. Define a component — maps source files to a named node in the graph
booklib component add auth "src/auth/**"

# 2. Capture a note about your architecture decision
echo "Use short-lived JWTs (15 min) with refresh token rotation" | booklib note "JWT strategy"

# 3. Link the note to the component
booklib link "JWT strategy" "auth" --type applies-to

# 4. Now ask for context — BookLib injects both book wisdom and your own captured knowledge
booklib context "implement JWT middleware" --file src/auth/middleware.js
```

You'll see a `## Knowledge Graph Context` section in the output with your note alongside the relevant book principles. This is graph-aware context injection — it traverses the graph from the component owning the file, finds linked knowledge, and combines it with semantic search.

````

- [ ] **Step 2: Fix the link examples in the Knowledge Graph section**

Find the `### Edges` subsection (line ~260) in the Knowledge Graph section. Current examples:

```bash
booklib link node_abc comp_auth --type applies-to
booklib link comp_auth comp_payments --type depends-on
booklib link node_jwt node_rfc7519 --type see-also
```

Replace with title-based examples (v1.12 feature):

```bash
# Link by title — no need to look up IDs
booklib link "JWT strategy" "auth" --type applies-to
booklib link "auth" "payments" --type depends-on
booklib link "JWT strategy" "RFC 7519 notes" --type see-also

# Exact IDs still work if you prefer
booklib link node_abc123 comp_auth456 --type applies-to
```

- [ ] **Step 3: Verify the sections exist in the updated README**

```bash
grep -n "Your First 5 Minutes\|booklib component add auth\|booklib link.*JWT" README.md
```

Expected: all three patterns found with correct line numbers.

```bash
grep -n "node_abc comp_auth\|node_jwt node_rfc7519" README.md
```

Expected: no output (old examples removed).

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: rewrite Quick Start; add 5-minute knowledge graph guide; fix link examples to use titles"
```

---

## Success Criteria

1. `booklib research` success message no longer tells users to manually re-run `booklib index`
2. First run of `booklib index` prints "~25 MB, ~1 min" warning before downloading
3. `booklib context --file path/to/file.js` on a file with no component prints a helpful `booklib component add` hint to stderr
4. README Quick Start runs `booklib init` before `booklib index` and warns about model download
5. README has a "Your First 5 Minutes" knowledge graph walkthrough
6. README link examples use titles, not raw IDs
7. All 25 tests pass
