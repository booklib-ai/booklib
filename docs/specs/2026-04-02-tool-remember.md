# Tool Spec: `remember`
*Replaces: `create_note`*

## Name
`remember`

## Purpose
Capture an insight, decision, pattern, or piece of knowledge for future recall. Creates a searchable knowledge node that becomes part of the project's knowledge graph.

## When the agent should call this
- User says "remember this", "save this", "note this down", "capture this"
- User makes an architecture decision worth preserving
- User discovers a pattern during code review
- Agent identifies a reusable insight during a session
- User says "we decided to..." or "from now on we..."

## When NOT to call this
- For searching knowledge (use `lookup`)
- For temporary session notes (use `save_progress`)
- When the user is just thinking out loud, not making a decision

## Input
```json
{
  "title": "string (required) — short descriptive title",
  "content": "string (optional) — detailed description, markdown supported",
  "type": "string (optional, default: 'insight') — 'insight' | 'decision' | 'pattern' | 'note' | 'research'",
  "tags": "string (optional) — comma-separated tags for categorization",
  "links": "string (optional) — 'target:edge-type' pairs, e.g. 'auth:applies-to,security:see-also'"
}
```

## Output
```json
{
  "id": "insight_a1b2c3d4",
  "title": "Use event sourcing for order state",
  "type": "decision",
  "saved_to": "~/.booklib/knowledge/nodes/insight_a1b2c3d4.md",
  "indexed": true,
  "links_created": ["auth (applies-to)"],
  "note": "Saved and indexed. This will appear in future lookups."
}
```

## Processing
1. Generate node ID
2. Serialize as gray-matter markdown
3. Save to `~/.booklib/knowledge/nodes/`
4. Auto-index into search engine (immediately searchable)
5. If explicit links provided, parse and create edges in `graph.jsonl`
6. **Auto-linking** (always runs, even without explicit links):
   a. Search existing components for keywords from the title and content
   b. If a component matches (e.g., title mentions "orders" → finds `order-service` component), create an `applies-to` edge automatically
   c. Search existing knowledge nodes for semantic similarity
   d. If a closely related node exists (e.g., saving "JWT refresh rotation" when "JWT strategy" already exists), create a `see-also` edge automatically
   e. Report all auto-created links in the output so the user knows what was connected

## Auto-linking

After saving the node, `remember` calls the shared auto-linker module (`lib/engine/auto-linker.js` — see [auto-linker spec](./2026-04-02-auto-linker.md)). This automatically:

1. Connects the note to matching project components (by keyword in title/content)
2. Connects the note to related existing knowledge (by semantic similarity)

No explicit `connect` call needed. The graph builds itself.

**Example:**

```
User: "remember that we decided to use event sourcing for orders"

BookLib:
  1. Saves note: "decided to use event sourcing for orders"
  2. Auto-linker: title contains "orders" → component "order-service" exists → creates applies-to edge
  3. Auto-linker: finds existing note "Order processing architecture" → creates see-also edge
  4. Returns:
     {
       "id": "decision_a1b2c3d4",
       "title": "decided to use event sourcing for orders",
       "auto_linked": [
         "order-service (applies-to) — component name match",
         "Order processing architecture (see-also) — related knowledge"
       ]
     }
```

Now when the agent later works on anything touching `order-service` files and calls `brief`, the graph traversal finds this decision — even if the agent's query uses completely different words like "clean up backend data flow."

## Edge cases
- Empty title → return error "Title is required"
- Invalid explicit link format → save node, skip bad links, warn
- Invalid edge type → list valid types in error
- Duplicate title → save anyway (different ID), note that similar knowledge exists
- No components defined → skip component auto-linking
- No existing knowledge → skip knowledge auto-linking
- Auto-link creates a duplicate edge → skip silently

## Difference from `save_progress`
`remember` captures KNOWLEDGE — facts, decisions, patterns that are permanently useful. `save_progress` captures SESSION STATE — what you're doing right now, for handoff to another agent. Knowledge persists forever. Session state is temporary.
