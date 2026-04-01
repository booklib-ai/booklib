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

## Auto-linking detail

The goal: when the user says "remember that we use event sourcing for orders," BookLib should automatically connect this to the `order-service` component and any related existing notes — without the user having to call `connect` separately.

**Component matching:**
- Extract keywords from title + content
- Search all defined components (from `booklib component add`) by name and glob patterns
- If a component name or its file paths overlap with the note's keywords → create `applies-to` edge
- Threshold: only link if the match is obvious (exact keyword in component name), not fuzzy

**Knowledge matching:**
- Run `lookup` with the note's title against existing knowledge nodes only (source: 'knowledge')
- If top result has high relevance (above the calibrated logit threshold) → create `see-also` edge
- Skip if the match is the note itself (same ID)
- Maximum 3 auto-links to prevent noise

**Example:**

```
User: "remember that we decided to use event sourcing for orders"

BookLib:
  1. Saves note: "decided to use event sourcing for orders"
  2. Auto-link: title contains "orders" → component "order-service" exists → creates applies-to edge
  3. Auto-link: lookup finds existing note "Order processing architecture" → creates see-also edge
  4. Returns:
     {
       "id": "decision_a1b2c3d4",
       "title": "decided to use event sourcing for orders",
       "auto_linked": [
         "order-service (applies-to) — matched 'orders' in component name",
         "Order processing architecture (see-also) — related existing knowledge"
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
