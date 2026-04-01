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
- For trivial tasks — renaming variables, fixing typos, writing commit messages
- When the previous lookup in this session already covered the same topic

## How the agent should formulate the query

The MCP tool description should include this guidance:

> Query with your **task description + domain**, not keywords and not full sentences.
>
> Good queries:
> - `"authentication patterns for spring boot"`
> - `"error handling in kotlin coroutines"`
> - `"react component structure best practices"`
>
> Bad queries (too vague):
> - `"auth"`
> - `"best practices"`
> - `"how to code"`
>
> Bad queries (too specific):
> - `"how should I implement JWT refresh token rotation in Spring Boot using OncePerRequestFilter with stateless sessions and httpOnly cookies"`
>
> The right level: describe WHAT you're doing and in WHAT domain. Let BookLib find the relevant principles.

## Input
```json
{
  "query": "string (required) — task description + domain",
  "file": "string (optional) — path to the file being worked on. BookLib uses this for language/framework detection and component matching, NOT for reading file content.",
  "limit": "number (optional, default: 3) — max results. Default lowered from 5 to 3 to reduce context pollution.",
  "source": "string (optional, default: 'all') — 'all' | 'skills' | 'knowledge'"
}
```

### How the `file` parameter helps

The file path provides signal without sending content:

| File path | What BookLib infers |
|-----------|-------------------|
| `src/auth/JwtFilter.java` | Language: Java. Framework: Spring (from project). Domain: auth, JWT. Component: auth (if defined). |
| `components/OrderList.tsx` | Language: TypeScript/React. Domain: orders, UI. Component: order-service (if defined). |
| `scripts/deploy.sh` | Language: Shell. Domain: deployment. Unlikely to have relevant expert knowledge. |

BookLib uses this to:
1. Boost results from matching language/framework skills
2. Find the owning component in the knowledge graph
3. Traverse graph edges for project-specific decisions about this area
4. NOT read the file — the path alone is enough signal

## Output (target format)
```json
{
  "query": "auth best practices for spring boot",
  "file": "src/auth/JwtFilter.java",
  "results": [
    {
      "principle": "Use stateless JWT with OncePerRequestFilter",
      "context": "Validate tokens per-request, don't store sessions server-side",
      "source": "springboot-security",
      "section": "core_principles"
    },
    {
      "principle": "Event sourcing is intentional for auth events — don't refactor",
      "context": "Team decision from 2026-04-01",
      "source": "project decision",
      "section": "knowledge"
    }
  ],
  "note": "2 results: 1 expert principle, 1 project decision."
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
1. If `file` provided, detect language/framework and find owning component
2. Run hybrid search (BM25 + vector + SRAG + RRF + reranker) with query
3. If component found, also traverse graph edges (1 hop) for linked knowledge
4. Apply post-processing (fast/local/API mode from config)
5. Filter by relevance threshold (raw logits, not sigmoid)
6. If `file` provided, boost results matching the detected language/framework
7. Extract individual principles from XML structure
8. Cap at `limit` (default 3)
9. Structure output — project decisions sorted above generic expert principles

## Frequency guidance

The MCP tool description should include:

> Call this tool once per distinct task, not per message. If you already looked up "auth patterns" in this session, don't look it up again. If you switch to a different topic (from auth to database design), that's a new lookup.

## Edge cases
- Empty query → return error "Query is required"
- Index not built → return error "Run booklib init first"
- All results below threshold → return empty with note
- Very broad query → return top results but cap at limit
- File doesn't exist → ignore file parameter, search normally
- File is in a language with no matching skills → search normally, may return empty

## Merges
This tool replaces both `search_skills` and `search_knowledge`. The `source` parameter controls the filter:
- `all` (default) — searches everything (expert knowledge + personal insights)
- `skills` — only expert knowledge from skill files
- `knowledge` — only personal captured insights
