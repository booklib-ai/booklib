# Tool Spec: `lookup`
*Replaces: `search_skills` + `search_knowledge`*

## Name
`lookup`

## Purpose
Look up relevant knowledge for a task, question, or piece of code. Returns structured principles — or nothing if nothing is relevant.

## When the agent should call this
- Before reviewing or writing code
- Before answering a best-practices question
- Before suggesting an architectural pattern
- When the user asks "how should I..." or "what's the best way to..."
- When the agent is unsure about a design decision

## When NOT to call this
- For general conversation unrelated to work
- When the agent already has a clear, confident answer
- Repeatedly for the same query within a session

## Input
```json
{
  "query": "string (required) — natural language question or task description",
  "limit": "number (optional, default: 5) — max results",
  "source": "string (optional, default: 'all') — 'all' | 'skills' | 'knowledge'"
}
```

## Output (target format)
```json
{
  "query": "auth best practices for spring boot",
  "results": [
    {
      "principle": "Use stateless JWT with OncePerRequestFilter",
      "context": "Validate tokens per-request, don't store sessions server-side",
      "source": "springboot-security",
      "section": "core_principles"
    }
  ],
  "note": "1 relevant result from 1 source."
}
```

When nothing is relevant:
```json
{
  "query": "best color for buttons",
  "results": [],
  "note": "No relevant knowledge found."
}
```

## Processing
1. Run hybrid search (BM25 + vector + SRAG + RRF + reranker)
2. Apply post-processing (fast/local/API mode from config)
3. Filter by relevance threshold (raw logits, not sigmoid)
4. Extract individual principles from XML structure
5. Structure output as above

## Edge cases
- Empty query → return error "Query is required"
- Index not built → return error "Run booklib init first"
- All results below threshold → return empty with note
- Very broad query → return top results but cap at limit

## Merges
This tool replaces both `search_skills` and `search_knowledge`. The `source` parameter controls the filter:
- `all` (default) — searches everything
- `skills` — only expert knowledge from skill files
- `knowledge` — only personal captured insights
