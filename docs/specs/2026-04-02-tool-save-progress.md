# Tool Spec: `save_progress`
*Replaces: `save_session_state`*

## Name
`save_progress`

## Purpose
Save the current agent's working state — what the goal is, what's been done, what's next — so another agent (or a future session) can resume without losing context.

## When the agent should call this
- User says "save where we are" or "I need to stop"
- Agent is about to hand off to another agent
- Long session is ending and work isn't complete
- User switches branches or projects mid-session

## When NOT to call this
- To save permanent knowledge (use `remember`)
- To save code (use git)
- Automatically — only when explicitly asked or at natural stopping points

## Input
```json
{
  "goal": "string (required) — the ultimate objective of the session",
  "next": "string (required) — the immediate next task for whoever resumes",
  "progress": "string (optional) — what has been achieved so far",
  "name": "string (optional) — session name, defaults to git branch"
}
```

## Output
```json
{
  "session": "feature/auth-module",
  "saved_to": ".booklib/sessions/feature-auth-module.md",
  "note": "Progress saved. Resume with: booklib resume"
}
```

## Processing
1. Collect goal, progress, next
2. Detect git branch for session name (if not provided)
3. Write structured markdown to `.booklib/sessions/<name>.md`
4. Include timestamp and active skills list

## Edge cases
- Not in a git repo → use `name` parameter or default to "session"
- Session file already exists → overwrite with new state
- Missing required fields → return error

## Difference from `remember`
`save_progress` captures WHERE YOU ARE in a task — temporary, session-scoped. `remember` captures WHAT YOU LEARNED — permanent, knowledge-scoped. Progress is consumed and discarded when the task resumes. Knowledge persists forever.
