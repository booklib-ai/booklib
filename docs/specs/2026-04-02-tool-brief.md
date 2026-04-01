# Tool Spec: `brief`
*Replaces: `get_context`*

## Name
`brief`

## Purpose
Get a concise briefing on what you need to know for a specific task. Combines relevant expert knowledge + personal captured insights + project component context into one structured response.

## When the agent should call this
- Starting a new task or switching context
- User says "I'm going to work on X"
- Agent needs broad context before diving into implementation
- Beginning a session in a project the agent hasn't seen before

## When NOT to call this
- For a specific question (use `lookup` instead)
- For reviewing a file (use `review_file` instead)
- Mid-task when you need one specific principle (use `lookup`)
- When continuing the same task — only brief at task start, not repeatedly

## Input
```json
{
  "task": "string (required) — description of the task about to be done",
  "file": "string (optional) — path to the file being edited, enables component-level context from knowledge graph"
}
```

## Output (target format)
```json
{
  "task": "implement JWT refresh token rotation",
  "briefing": {
    "expert_knowledge": [
      {
        "principle": "Use short-lived JWTs (15 min) with refresh token rotation",
        "source": "springboot-security"
      }
    ],
    "project_knowledge": [
      {
        "insight": "We decided to use event sourcing for auth events",
        "source": "captured note: auth-strategy",
        "linked_to": "auth component"
      }
    ],
    "related_components": ["auth", "user-service"]
  },
  "note": "2 knowledge sources, 1 project insight, 2 related components."
}
```

When nothing relevant:
```json
{
  "task": "set up CI pipeline",
  "briefing": {
    "expert_knowledge": [],
    "project_knowledge": [],
    "related_components": []
  },
  "note": "No relevant knowledge found for this task."
}
```

## Processing
1. Run `lookup` with the task description
2. If `file` provided, find owning component in knowledge graph
3. Traverse graph edges from component (1 hop) for linked knowledge
4. Combine expert knowledge + personal insights + component context
5. Deduplicate and structure

## Difference from `lookup`
`lookup` is a search — returns principles matching a query. `brief` is a synthesis — combines multiple knowledge sources into a task-oriented briefing. `brief` calls `lookup` internally but adds graph traversal and project context.

## Edge cases
- No index → return error
- No graph → return only expert knowledge, skip project knowledge
- File doesn't match any component → skip component context, still return expert knowledge
