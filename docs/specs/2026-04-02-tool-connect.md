# Tool Spec: `connect`
*Replaces: `link_nodes`*

## Name
`connect`

## Purpose
Create a relationship between two pieces of knowledge. Tells the knowledge graph that concept A relates to concept B in a specific way.

## When the agent should call this
- User says "these are related" or "X connects to Y"
- Agent discovers during work that two captured insights are related
- User says "this applies to..." or "this is similar to..."
- After calling `remember`, if the new insight relates to existing knowledge

## When NOT to call this
- To save new knowledge (use `remember`)
- To search for connections (use `lookup` with `--graph`)

## Input
```json
{
  "from": "string (required) — source node: exact ID or partial title",
  "to": "string (required) — target node: exact ID or partial title",
  "type": "string (required) — relationship type"
}
```

### Relationship types
| Type | Meaning | Example |
|------|---------|---------|
| `see-also` | Related concepts | "JWT strategy" see-also "session management" |
| `applies-to` | Knowledge applies to a domain | "SOLID principles" applies-to "auth module" |
| `extends` | Builds on top of | "refresh token rotation" extends "JWT strategy" |
| `implements` | Concrete implementation of concept | "JwtFilter.java" implements "JWT strategy" |
| `contradicts` | Conflicts with | "stateful sessions" contradicts "stateless JWT" |
| `inspired-by` | Influenced by | "our auth design" inspired-by "OAuth2 spec" |
| `supersedes` | Replaces | "v2 auth flow" supersedes "v1 auth flow" |
| `depends-on` | Requires | "payment flow" depends-on "auth module" |

## Output
```json
{
  "from": "insight_a1b2c3d4",
  "to": "insight_e5f6g7h8",
  "type": "see-also",
  "note": "Connected 'JWT strategy' → 'session management' (see-also)"
}
```

## Processing
1. Resolve `from` and `to` — accept exact IDs or partial title search
2. Validate relationship type against allowed list
3. Append edge to `graph.jsonl`

## Edge cases
- Node not found → return error with suggestions from `recalled`
- Ambiguous title (matches multiple) → return error listing matches
- Invalid relationship type → return error listing valid types
- Self-link (from === to) → return error
- Duplicate edge → save anyway (graph can have multiple edges between same nodes)
