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
5. If links provided, parse and create edges in `graph.jsonl`

## Edge cases
- Empty title → return error "Title is required"
- Invalid link format → save node, skip bad links, warn
- Invalid edge type → list valid types in error
- Duplicate title → save anyway (different ID), note that similar knowledge exists

## Difference from `save_progress`
`remember` captures KNOWLEDGE — facts, decisions, patterns that are permanently useful. `save_progress` captures SESSION STATE — what you're doing right now, for handoff to another agent. Knowledge persists forever. Session state is temporary.
