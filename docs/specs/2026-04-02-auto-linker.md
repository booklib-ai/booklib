# Spec: Auto-Linker Module
*Date: 2026-04-02 | Status: Draft*

## Problem

Knowledge nodes are created from many entry points (remember, capture, note, dictate, save-chat, research, component add). Each one should automatically connect new knowledge to existing components and related notes. Without auto-linking, the knowledge graph stays disconnected — the user has to manually call `connect` for every relationship. Most won't.

## Solution

A single module `lib/engine/auto-linker.js` that runs after any knowledge node is created. Every call site invokes the same function. The graph builds itself.

## API

```js
import { autoLink } from './auto-linker.js';

const links = await autoLink({
  nodeId,        // the newly created node's ID
  title,         // node title
  content,       // node content (optional, for deeper matching)
  tags,          // node tags (optional)
  indexPath,     // search index path (for semantic matching)
  nodesDir,      // knowledge nodes directory
  graphFile,     // graph.jsonl path
});

// Returns:
// [
//   { from: nodeId, to: 'order-service', type: 'applies-to', reason: 'component name match' },
//   { from: nodeId, to: 'insight_xyz', type: 'see-also', reason: 'semantic similarity' },
// ]
```

## What it does

### Step 1: Component matching
- Extract keywords from title + content + tags
- Load all defined components (nodes with type 'component')
- For each component: check if component name appears in the keywords
- If match → create `applies-to` edge from the new node to the component
- Only exact keyword matches (e.g., "orders" in title matches component "order-service") — no fuzzy matching to avoid false positives

### Step 2: Knowledge matching
- Run a search against existing knowledge nodes using the new node's title as query
- Source filter: knowledge only (skip skills)
- If top result has high relevance (above calibrated threshold) AND is not the node itself → create `see-also` edge
- Maximum 3 auto-links to prevent noise
- Skip results that are already linked to this node

### Step 3: Reverse linking (for component add only)
- When a NEW component is created, search existing notes for mentions of the component name
- For each matching note → create `applies-to` edge from the note to the new component
- This retroactively connects old notes to new components

## Call sites

Every place that creates a knowledge node calls `autoLink()` after saving:

| Call site | File | When |
|-----------|------|------|
| `remember` MCP tool | `bin/booklib-mcp.js` | After creating note via MCP |
| `booklib capture` | `bin/booklib.js` | After CLI capture command |
| `booklib note` | `bin/booklib.js` | After creating note from stdin |
| `booklib dictate` | `bin/booklib.js` | After AI-structured note saved |
| `booklib save-chat` | `bin/booklib.js` | After conversation saved as node |
| `booklib research` | `bin/booklib.js` | After research stub created |
| `booklib component add` | `bin/booklib.js` | After component defined (runs reverse linking) |

## What it does NOT do

- Does not create nodes — only edges
- Does not modify existing edges — only adds new ones
- Does not auto-link to skills — only to components and other knowledge nodes. Skill connections are for the search engine, not the graph.
- Does not block on failure — if auto-linking fails (no index, no components), the node is still saved. Auto-linking is best-effort.

## Configuration

`booklib.config.json`:
```json
{
  "autoLink": true
}
```

Can be disabled with `"autoLink": false` for users who want manual control. Default: `true`.

## Output integration

Every command that creates a node reports auto-links:

```
✓ Knowledge node created: insight_a1b2c3d4
  Auto-linked:
    → order-service (applies-to) — component name match
    → "Order processing notes" (see-also) — related knowledge
```

MCP tool `remember` includes auto-links in its response:

```json
{
  "id": "insight_a1b2c3d4",
  "title": "Use event sourcing for orders",
  "auto_linked": [
    {"to": "order-service", "type": "applies-to", "reason": "component name match"},
    {"to": "insight_xyz", "type": "see-also", "reason": "related knowledge"}
  ]
}
```

## Edge cases

- No components defined → skip component matching, still do knowledge matching
- No existing knowledge → skip knowledge matching, still do component matching  
- No search index → skip knowledge matching (needs embeddings)
- New node matches itself in search → skip (filter by ID)
- Duplicate edge would be created → skip silently
- Auto-link disabled in config → return empty, create no edges
- Very generic title ("notes", "ideas") → likely matches everything. The relevance threshold filters this — generic titles produce low similarity scores against specific nodes.

## Files

- Create: `lib/engine/auto-linker.js`
- Create: `tests/engine/auto-linker.test.js`
- Modify: `bin/booklib.js` — add `autoLink()` call to capture, note, dictate, save-chat, research, component add
- Modify: `bin/booklib-mcp.js` — add `autoLink()` call to create_note (or `remember` after rename)

## Dependencies

- Needs search index to exist for knowledge matching (graceful fallback if not)
- Needs `graph.js` primitives (appendEdge, loadEdges, listNodes) — already exist
- Independent of MCP tool rename — works with current or new names
