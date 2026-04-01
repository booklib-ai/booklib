# Spec: MCP Tool Redesign
*Date: 2026-04-02 | Status: Draft — needs individual tool specs*

## Problem

Current MCP tool names are BookLib-internal jargon (`search_skills`, `list_nodes`, `get_context`). An AI agent seeing these names doesn't intuitively know when to call them. The names, purposes, inputs, outputs, and trigger conditions need careful design — each tool is a product decision.

## Current tools

| Name | What it does now |
|------|-----------------|
| `search_skills` | Hybrid search across skill library |
| `search_knowledge` | Search skills + knowledge graph |
| `audit_content` | Deep file review against a named skill |
| `get_context` | Build compiled context for a task |
| `save_session_state` | Save progress for agent handoff |
| `create_note` | Create knowledge node |
| `list_nodes` | List knowledge graph nodes |
| `link_nodes` | Create typed edge between nodes |

## What needs design for each tool

Each tool needs its own mini-spec answering:

1. **Name** — what the agent sees. Should read like a natural action.
2. **One-line purpose** — what it does in plain language.
3. **When to trigger** — specific situations where the agent should call this. Written as trigger conditions, not abstract descriptions.
4. **When NOT to trigger** — explicit situations to avoid over-calling.
5. **How to formulate the query** — guidance on what makes a good vs bad query. Included in the MCP tool description so the agent sees it.
6. **Input schema** — what parameters, which are required, what format. Include optional `file` parameter where it helps with language/domain detection.
7. **Output format** — what the structured response looks like. Follows the principle: return actionable principles or "nothing relevant found."
8. **Frequency guidance** — how often the agent should call this tool within a session.
9. **Edge cases** — what happens when no results match, when the index doesn't exist, when the query is too vague.
10. **What it does NOT do** — prevent misuse / confusion with other tools.

## Design principles for all tools

### Query quality
The MCP tool description is the ONLY place we can teach the agent how to query well. Each description should include:
- Example good queries (task + domain)
- Example bad queries (too vague, too specific)
- The right granularity level

### Frequency control
Each tool description should include explicit guidance on call frequency:
- "Once per distinct task, not per message"
- "Don't repeat if you already covered this topic in this session"
- "Skip for trivial tasks"

### File parameter
Tools that benefit from language/domain context should accept an optional `file` parameter. BookLib infers from the path (language, framework, component) without reading content. This keeps the query small while providing useful signal.

### Empty results
Every tool must handle "nothing relevant" gracefully. Return an explicit note, not an empty array that the agent might misinterpret as an error.

## Proposed tool list (subject to design)

These are starting points — each may change during individual design:

| Proposed name | Direction |
|--------------|-----------|
| `lookup` | Search for relevant knowledge given a task/question |
| `review_file` | Deep-review a specific file against known principles |
| `brief` | Get a concise briefing on what to know for a task |
| `remember` | Capture an insight for future recall |
| `recalled` | List what has been captured/remembered |
| `connect` | Create a relationship between two pieces of knowledge |
| `save_progress` | Save current work state for handoff |

## Open questions

- Should `search_skills` and `search_knowledge` merge into one tool with a filter param, or stay separate?
- Is `get_context` (now `brief`) redundant with `lookup`? Or is there a meaningful difference between "find relevant knowledge" and "build a full briefing"?
- Should `audit_content` require a specific skill name, or should it auto-detect the relevant skill?
- Do we need 7 tools or can some merge? Fewer tools = less cognitive load for the agent.

## Next steps

Create individual spec files for each tool:
- `docs/specs/2026-04-02-tool-lookup.md`
- `docs/specs/2026-04-02-tool-review.md`
- `docs/specs/2026-04-02-tool-brief.md`
- `docs/specs/2026-04-02-tool-remember.md`
- `docs/specs/2026-04-02-tool-recalled.md`
- `docs/specs/2026-04-02-tool-connect.md`
- `docs/specs/2026-04-02-tool-save-progress.md`

Each spec answers all 7 design questions above. Then implement as a batch.

## Breaking change strategy

Renaming MCP tools breaks existing configurations. Options:
- Keep old names as aliases during a transition period
- Bump MCP server version and document migration
- Or: if adoption is still small, just rename and update docs
