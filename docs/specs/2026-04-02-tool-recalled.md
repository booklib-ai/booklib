# Tool Spec: `recalled`
*Replaces: `list_nodes`*

## Name
`recalled`

## Purpose
List what has been captured and remembered in this project's knowledge graph. Shows saved insights, decisions, patterns, and notes.

## When the agent should call this
- User asks "what have I saved?" or "what do I know?" or "show my notes"
- Agent needs to check if a topic was already captured before calling `remember`
- User wants to review captured decisions before starting new work

## When NOT to call this
- For searching specific knowledge (use `lookup`)
- To find expert knowledge from skills (use `lookup` with source: 'skills')

## Input
```json
{
  "type": "string (optional) — filter by type: 'insight' | 'decision' | 'pattern' | 'note' | 'research' | 'all'",
}
```

## Output
```json
{
  "nodes": [
    {
      "id": "insight_a1b2c3d4",
      "title": "Use event sourcing for order state",
      "type": "decision",
      "tags": ["architecture", "orders"],
      "created": "2026-04-01"
    },
    {
      "id": "insight_e5f6g7h8",
      "title": "JWT refresh tokens must rotate",
      "type": "insight",
      "tags": ["auth", "security"],
      "created": "2026-04-01"
    }
  ],
  "total": 2,
  "note": "2 items captured. Use lookup to search their content."
}
```

When nothing has been captured:
```json
{
  "nodes": [],
  "total": 0,
  "note": "Nothing captured yet. Use remember to save insights."
}
```

## Processing
1. Read all nodes from `~/.booklib/knowledge/nodes/`
2. Parse frontmatter for metadata (id, title, type, tags, created)
3. Filter by type if provided
4. Return sorted by creation date (newest first)

## Edge cases
- No knowledge directory exists → return empty with note
- Corrupted node file → skip it, log warning
