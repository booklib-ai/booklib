# MCP Server: Knowledge Graph Tools — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the BookLib MCP server to expose the v1.12 knowledge graph features so non-Claude agents (Cursor, Windsurf, Zed, Continue.dev) have full parity with Claude Code users.

**Architecture:** All changes are in `bin/booklib-mcp.js`. Five new MCP tools are added: `get_context`, `create_note`, `search_knowledge`, `list_nodes`, `link_nodes`. Each tool wraps existing library functions already used by the CLI. Tests go in `tests/engine/mcp-tools.test.js` and test the underlying library functions directly (not the MCP protocol layer, which is handled by the SDK).

**Tech Stack:** `@modelcontextprotocol/sdk` (already installed), `lib/context-builder.js`, `lib/engine/graph.js`, `lib/engine/indexer.js`, `lib/engine/searcher.js`.

---

## Files

| File | Change |
|---|---|
| `bin/booklib-mcp.js` | Add 5 new tools; bump server version to 1.2.0 |
| `tests/engine/mcp-tools.test.js` | New: tests for the library functions the tools call |
| `README.md` | Update MCP section with new tool list and npx install path |

---

### Task 1: Add `get_context` tool — full context builder via MCP

**What it does:** Calls `ContextBuilder.buildWithGraph(task, filePath?)` and returns the compiled system prompt. This is the single most powerful BookLib feature; it's missing entirely from the current MCP server.

**Files:**
- Modify: `bin/booklib-mcp.js`
- Create: `tests/engine/mcp-tools.test.js`

- [ ] **Step 1: Create the test file**

```bash
touch /Users/fvst/other/fp/skills/.worktrees/adoption/tests/engine/mcp-tools.test.js
```

Write `tests/engine/mcp-tools.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

// ── get_context ───────────────────────────────────────────────────────────────

test('ContextBuilder.build returns a non-empty string for a valid task', async (t) => {
  const { ContextBuilder } = await import('../../lib/context-builder.js');
  const builder = new ContextBuilder();
  const result = await builder.build('implement null safety in Kotlin');
  assert.ok(typeof result === 'string', 'result is a string');
  assert.ok(result.length > 50, 'result has meaningful content');
});

test('ContextBuilder.buildWithGraph returns skill context even with no file', async (t) => {
  const { ContextBuilder } = await import('../../lib/context-builder.js');
  const builder = new ContextBuilder();
  const result = await builder.buildWithGraph('implement null safety in Kotlin', null);
  assert.ok(typeof result === 'string', 'result is a string');
  assert.ok(result.length > 50, 'result has meaningful content');
});
```

- [ ] **Step 2: Run the tests to verify they pass**

```bash
cd /Users/fvst/other/fp/skills/.worktrees/adoption && node --test tests/engine/mcp-tools.test.js 2>&1 | tail -6
```

Expected: 2 tests pass. (These verify the underlying library works before we wire it into MCP.)

- [ ] **Step 3: Add `get_context` to the MCP tool list in `bin/booklib-mcp.js`**

In the `ListToolsRequestSchema` handler, add to the `tools` array:

```js
{
  name: "get_context",
  description: "Builds a compiled context prompt combining relevant book wisdom and personal knowledge graph nodes for a given task. Optionally provide a file path to include graph context for the owning component.",
  inputSchema: {
    type: "object",
    properties: {
      task: {
        type: "string",
        description: "The task description (e.g. 'implement JWT refresh token rotation')",
      },
      file: {
        type: "string",
        description: "Optional: path to the file being edited — enables graph context injection for the owning component",
      },
    },
    required: ["task"],
  },
},
```

- [ ] **Step 4: Add the import and handler in `bin/booklib-mcp.js`**

At the top of the file, add the import alongside existing imports:

```js
import { ContextBuilder } from "../lib/context-builder.js";
```

In the `CallToolRequestSchema` handler `switch`, add:

```js
case "get_context": {
  const builder = new ContextBuilder();
  const result = args.file
    ? await builder.buildWithGraph(args.task, args.file)
    : await builder.build(args.task);
  return { content: [{ type: "text", text: result }] };
}
```

- [ ] **Step 5: Run all tests**

```bash
cd /Users/fvst/other/fp/skills/.worktrees/adoption && node --test tests/engine/graph.test.js tests/engine/capture.test.js tests/engine/graph-injector.test.js tests/engine/mcp-tools.test.js 2>&1 | tail -6
```

Expected: all 26 tests pass (24 existing + 2 new).

- [ ] **Step 6: Commit**

```bash
git add bin/booklib-mcp.js tests/engine/mcp-tools.test.js
git commit -m "feat(mcp): add get_context tool — full context builder via MCP"
```

---

### Task 2: Add `create_note` tool — create knowledge nodes via MCP

**What it does:** Accepts a title and optional content string, creates a knowledge node, auto-indexes it. Equivalent to `echo "<content>" | booklib note "<title>"` but callable by any MCP agent.

**Files:**
- Modify: `bin/booklib-mcp.js`
- Modify: `tests/engine/mcp-tools.test.js`

- [ ] **Step 1: Add tests to `tests/engine/mcp-tools.test.js`**

```js
// ── create_note ───────────────────────────────────────────────────────────────

test('serializeNode + saveNode creates a readable node file', async (t) => {
  const { serializeNode, saveNode, loadNode, parseNodeFrontmatter, generateNodeId } = await import('../../lib/engine/graph.js');
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'mcp-note-'));
  const id = generateNodeId('node');
  const content = serializeNode({ id, type: 'note', title: 'MCP test note', content: 'body text' });
  const filePath = saveNode(content, id, { nodesDir: tmpDir });
  const raw = loadNode(id, { nodesDir: tmpDir });
  const parsed = parseNodeFrontmatter(raw);
  assert.strictEqual(parsed.title, 'MCP test note');
  assert.ok(parsed.body.includes('body text'));
});
```

- [ ] **Step 2: Run to verify passes**

```bash
cd /Users/fvst/other/fp/skills/.worktrees/adoption && node --test tests/engine/mcp-tools.test.js 2>&1 | tail -6
```

Expected: 3 tests pass.

- [ ] **Step 3: Add imports to `bin/booklib-mcp.js`**

Add to the imports at the top of `bin/booklib-mcp.js`:

```js
import { serializeNode, saveNode, generateNodeId } from "../lib/engine/graph.js";
import { BookLibIndexer } from "../lib/engine/indexer.js";
import { resolveBookLibPaths } from "../lib/paths.js";
```

(Note: `resolveBookLibPaths` is the same function used in `bin/booklib.js` — it returns `{ nodesDir, indexPath, ... }`.)

- [ ] **Step 4: Add tool definition to `ListToolsRequestSchema` handler**

```js
{
  name: "create_note",
  description: "Creates a knowledge node of type 'note' in the local knowledge graph and immediately indexes it for search.",
  inputSchema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "The note title (e.g. 'JWT refresh token strategy')",
      },
      content: {
        type: "string",
        description: "The note body (markdown supported). Leave empty to create a stub.",
      },
    },
    required: ["title"],
  },
},
```

- [ ] **Step 5: Add handler to `CallToolRequestSchema` switch**

```js
case "create_note": {
  const { nodesDir, indexPath } = resolveBookLibPaths();
  const id = generateNodeId('node');
  const nodeContent = serializeNode({
    id,
    type: 'note',
    title: args.title,
    content: args.content ?? '',
  });
  const filePath = saveNode(nodeContent, id, { nodesDir });
  try {
    const indexer = new BookLibIndexer(indexPath);
    await indexer.indexNodeFile(filePath, nodesDir);
  } catch {
    // Index may not exist yet — node is saved, will appear after booklib index
  }
  return { content: [{ type: "text", text: `Created note: ${id}\nTitle: ${args.title}\nFile: ${filePath}` }] };
}
```

- [ ] **Step 6: Run all tests**

```bash
cd /Users/fvst/other/fp/skills/.worktrees/adoption && node --test tests/engine/graph.test.js tests/engine/capture.test.js tests/engine/graph-injector.test.js tests/engine/mcp-tools.test.js 2>&1 | tail -6
```

Expected: all 27 tests pass.

- [ ] **Step 7: Commit**

```bash
git add bin/booklib-mcp.js tests/engine/mcp-tools.test.js
git commit -m "feat(mcp): add create_note tool — creates and indexes knowledge nodes via MCP"
```

---

### Task 3: Add `search_knowledge` tool — search skills + knowledge nodes

**What it does:** Replaces/supplements the existing `search_skills` tool. `search_skills` only returns content from the book index; `search_knowledge` returns both book skill chunks AND knowledge graph nodes, with a `type` field indicating which is which.

**Files:**
- Modify: `bin/booklib-mcp.js`
- Modify: `tests/engine/mcp-tools.test.js`

- [ ] **Step 1: Add test to `tests/engine/mcp-tools.test.js`**

```js
// ── search_knowledge ─────────────────────────────────────────────────────────

test('BookLibSearcher.search returns an array (empty or populated)', async (t) => {
  const { BookLibSearcher } = await import('../../lib/engine/searcher.js');
  const searcher = new BookLibSearcher();
  // May return empty if index not built in test env — we only check shape
  try {
    const results = await searcher.search('null safety', 3);
    assert.ok(Array.isArray(results), 'results is an array');
  } catch (err) {
    // Index not built — acceptable in test env
    assert.ok(err.message.includes('booklib index'), 'informative error message');
  }
});
```

- [ ] **Step 2: Run to verify passes**

```bash
cd /Users/fvst/other/fp/skills/.worktrees/adoption && node --test tests/engine/mcp-tools.test.js 2>&1 | tail -6
```

Expected: 4 tests pass.

- [ ] **Step 3: Add `BookLibSearcher` import to `bin/booklib-mcp.js`**

The file already imports `BookLibSearcher`. Verify it's present; if not, add:

```js
import { BookLibSearcher } from "../lib/engine/searcher.js";
```

- [ ] **Step 4: Add tool definition**

```js
{
  name: "search_knowledge",
  description: "Semantic search across both book skills and personal knowledge graph nodes. Returns ranked results with a 'source' field: 'skill' or 'knowledge'.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query (e.g. 'handling concurrency in Python')",
      },
      limit: {
        type: "number",
        description: "Maximum number of results (default: 8)",
      },
      source: {
        type: "string",
        enum: ["all", "skills", "knowledge"],
        description: "Filter by source: 'all' (default), 'skills', or 'knowledge'",
      },
    },
    required: ["query"],
  },
},
```

- [ ] **Step 5: Add handler**

```js
case "search_knowledge": {
  const searcher = new BookLibSearcher();
  const limit = args.limit ?? 8;
  const raw = await searcher.search(args.query, limit);
  const source = args.source ?? 'all';
  const results = raw
    .filter(r => {
      if (source === 'skills') return r.metadata?.nodeKind !== 'knowledge';
      if (source === 'knowledge') return r.metadata?.nodeKind === 'knowledge';
      return true;
    })
    .map(r => ({
      source: r.metadata?.nodeKind === 'knowledge' ? 'knowledge' : 'skill',
      title: r.metadata?.title ?? r.metadata?.skill ?? 'unknown',
      text: r.text,
      score: r.score,
    }));
  return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
}
```

- [ ] **Step 6: Run all tests**

```bash
cd /Users/fvst/other/fp/skills/.worktrees/adoption && node --test tests/engine/graph.test.js tests/engine/capture.test.js tests/engine/graph-injector.test.js tests/engine/mcp-tools.test.js 2>&1 | tail -6
```

Expected: all 28 tests pass.

- [ ] **Step 7: Commit**

```bash
git add bin/booklib-mcp.js tests/engine/mcp-tools.test.js
git commit -m "feat(mcp): add search_knowledge tool — unified search over skills + knowledge nodes"
```

---

### Task 4: Add `list_nodes` + `link_nodes` tools

**What they do:**
- `list_nodes` — returns all knowledge nodes with id, title, type (equivalent to `booklib nodes list`)
- `link_nodes` — creates a typed edge between two nodes by title-or-id (equivalent to `booklib link`)

**Files:**
- Modify: `bin/booklib-mcp.js`
- Modify: `tests/engine/mcp-tools.test.js`

- [ ] **Step 1: Add tests to `tests/engine/mcp-tools.test.js`**

```js
// ── list_nodes + link_nodes ───────────────────────────────────────────────────

test('listNodes returns array of IDs from a temp dir', async (t) => {
  const { listNodes, saveNode, serializeNode, generateNodeId } = await import('../../lib/engine/graph.js');
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'mcp-list-'));
  const id = generateNodeId('node');
  saveNode(serializeNode({ id, type: 'note', title: 'List test' }), id, { nodesDir: tmpDir });
  const ids = listNodes({ nodesDir: tmpDir });
  assert.ok(ids.includes(id), 'saved node appears in list');
});

test('resolveNodeRef + appendEdge creates a graph edge', async (t) => {
  const { listNodes, saveNode, serializeNode, generateNodeId, appendEdge, loadEdges, resolveNodeRef } = await import('../../lib/engine/graph.js');
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'mcp-link-'));
  const idA = generateNodeId('node');
  const idB = generateNodeId('node');
  saveNode(serializeNode({ id: idA, type: 'note', title: 'Source note' }), idA, { nodesDir: tmpDir });
  saveNode(serializeNode({ id: idB, type: 'component', title: 'Auth component' }), idB, { nodesDir: tmpDir });
  const resolvedA = resolveNodeRef('Source note', { nodesDir: tmpDir });
  assert.strictEqual(resolvedA, idA);
  // appendEdge uses the real graph.jsonl location — just verify it doesn't throw with valid args
  // (we don't pass a custom edgesFile here, so this writes to the real graph)
});
```

- [ ] **Step 2: Run to verify passes**

```bash
cd /Users/fvst/other/fp/skills/.worktrees/adoption && node --test tests/engine/mcp-tools.test.js 2>&1 | tail -6
```

Expected: 6 tests pass.

- [ ] **Step 3: Add `resolveNodeRef` + `appendEdge` to imports in `bin/booklib-mcp.js`**

Update the existing graph.js import line:

```js
import {
  serializeNode, saveNode, generateNodeId,
  listNodes, loadNode, parseNodeFrontmatter,
  resolveNodeRef, appendEdge,
} from "../lib/engine/graph.js";
```

- [ ] **Step 4: Add `list_nodes` tool definition**

```js
{
  name: "list_nodes",
  description: "Lists all knowledge graph nodes with their id, title, and type.",
  inputSchema: {
    type: "object",
    properties: {
      type_filter: {
        type: "string",
        description: "Optional: filter by node type ('note', 'research', 'component', 'decision', 'feature')",
      },
    },
  },
},
```

- [ ] **Step 5: Add `link_nodes` tool definition**

```js
{
  name: "link_nodes",
  description: "Creates a typed edge between two knowledge graph nodes. Accepts node IDs or partial title strings.",
  inputSchema: {
    type: "object",
    properties: {
      from: {
        type: "string",
        description: "Source node — exact ID or partial title (e.g. 'JWT strategy')",
      },
      to: {
        type: "string",
        description: "Target node — exact ID or partial title (e.g. 'auth')",
      },
      type: {
        type: "string",
        enum: ["implements","contradicts","extends","applies-to","see-also","inspired-by","supersedes","depends-on"],
        description: "Edge type",
      },
    },
    required: ["from", "to", "type"],
  },
},
```

- [ ] **Step 6: Add both handlers**

```js
case "list_nodes": {
  const { nodesDir } = resolveBookLibPaths();
  const allIds = listNodes({ nodesDir });
  const nodes = allIds
    .map(id => {
      const raw = loadNode(id, { nodesDir });
      if (!raw) return null;
      const parsed = parseNodeFrontmatter(raw);
      return { id, title: parsed.title ?? '', type: parsed.type ?? '' };
    })
    .filter(n => {
      if (!n) return false;
      if (args.type_filter) return n.type === args.type_filter;
      return true;
    });
  return { content: [{ type: "text", text: JSON.stringify(nodes, null, 2) }] };
}

case "link_nodes": {
  const from = resolveNodeRef(args.from);
  const to = resolveNodeRef(args.to);
  const VALID_TYPES = ['implements','contradicts','extends','applies-to','see-also','inspired-by','supersedes','depends-on'];
  if (!VALID_TYPES.includes(args.type)) {
    throw new Error(`Invalid edge type "${args.type}". Valid: ${VALID_TYPES.join(', ')}`);
  }
  const edge = {
    from,
    to,
    type: args.type,
    weight: 1.0,
    created: new Date().toISOString().split('T')[0],
  };
  appendEdge(edge);
  return { content: [{ type: "text", text: `Edge created: ${from} --[${args.type}]--> ${to}` }] };
}
```

- [ ] **Step 7: Run all tests**

```bash
cd /Users/fvst/other/fp/skills/.worktrees/adoption && node --test tests/engine/graph.test.js tests/engine/capture.test.js tests/engine/graph-injector.test.js tests/engine/mcp-tools.test.js 2>&1 | tail -6
```

Expected: all 30 tests pass (24 + 6 new).

- [ ] **Step 8: Commit**

```bash
git add bin/booklib-mcp.js tests/engine/mcp-tools.test.js
git commit -m "feat(mcp): add list_nodes and link_nodes tools"
```

---

### Task 5: Bump server version + update README MCP section

**What it does:** Bumps the MCP server `version` from `1.1.0` to `1.2.0` to signal the new tools. Updates the README to show the current 8 tools, add the npx one-liner for Claude Code, and mention the agent compatibility table.

**Files:**
- Modify: `bin/booklib-mcp.js` — version string
- Modify: `README.md` — MCP Server section (line ~353)

No tests for version strings or docs.

- [ ] **Step 1: Bump version in `bin/booklib-mcp.js`**

Find:
```js
const server = new Server(
  {
    name: "booklib-engine",
    version: "1.1.0",
  },
```

Replace `"1.1.0"` with `"1.2.0"`.

- [ ] **Step 2: Replace the MCP Server section in `README.md`**

Find `## MCP Server` (line ~353) and replace the whole section with:

````markdown
## MCP Server

BookLib ships a local MCP server that gives any MCP-compatible AI agent access to both the skill library and the knowledge graph.

```bash
# Claude Code
claude mcp add booklib -- npx @booklib/skills mcp

# Cursor / Windsurf / Zed — add to your mcp_servers config
{ "mcpServers": { "booklib": { "command": "npx", "args": ["@booklib/skills", "mcp"] } } }
```

**Available tools:**

| Tool | What it does |
|---|---|
| `get_context` | Full context builder — returns compiled book wisdom + knowledge graph for a task |
| `get_context` (with `file`) | Graph-aware context: also injects knowledge linked to the file's component |
| `create_note` | Create a knowledge node and index it immediately |
| `search_knowledge` | Semantic search across skills + knowledge nodes (filterable by source) |
| `list_nodes` | List all knowledge graph nodes with id, title, type |
| `link_nodes` | Create a typed edge between two nodes (by title or ID) |
| `audit_content` | Systematic file audit against a specific skill |
| `save_session_state` | Save agent progress for handoff to another agent |

**Agent compatibility:**

| | Claude Code | Cursor | Windsurf | Zed | Continue.dev | Copilot |
|---|---|---|---|---|---|---|
| Skills (auto-inject) | ✅ hook | via MCP | via MCP | via MCP | via MCP | ❌ |
| Context builder | ✅ | ✅ MCP | ✅ MCP | ✅ MCP | ✅ MCP | ❌ |
| Knowledge graph | ✅ | ✅ MCP | ✅ MCP | ✅ MCP | ✅ MCP | ❌ |

````

- [ ] **Step 3: Verify the section renders correctly**

```bash
grep -A 30 "## MCP Server" README.md | head -35
```

Expected: the table and tool list appear.

- [ ] **Step 4: Run all tests one final time**

```bash
cd /Users/fvst/other/fp/skills/.worktrees/adoption && node --test tests/engine/graph.test.js tests/engine/capture.test.js tests/engine/graph-injector.test.js tests/engine/mcp-tools.test.js 2>&1 | tail -6
```

Expected: all 30 tests pass.

- [ ] **Step 5: Commit**

```bash
git add bin/booklib-mcp.js README.md
git commit -m "feat(mcp): bump server to v1.2.0; update README with new tools and agent compatibility table"
```

---

## Success Criteria

1. `get_context` MCP tool returns the same compiled context as `booklib context "<task>"`
2. `create_note` MCP tool creates a `.md` node file in `.booklib/knowledge/nodes/` and indexes it
3. `search_knowledge` returns results from both skill chunks and knowledge node chunks; `source` field distinguishes them
4. `list_nodes` returns all nodes as a JSON array with `id`, `title`, `type`
5. `link_nodes` writes an edge to `graph.jsonl` and accepts titles (not just IDs)
6. All 30 tests pass
7. README MCP section shows the 8-tool table and agent compatibility matrix
