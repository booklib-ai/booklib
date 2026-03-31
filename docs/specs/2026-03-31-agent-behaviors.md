# Spec: Agent Behavior Instructions
*Date: 2026-03-31 | Status: Draft*

## Problem

Users must remember BookLib CLI commands (`booklib search`, `booklib capture`, `booklib doctor`, etc.) and run them manually. The tool should be invisible — the agent uses BookLib on behalf of the user without being asked.

## Solution

Every generated config file includes an **Agent Behaviors** block that teaches the AI agent how and when to use BookLib commands. The agent treats these as operational instructions, same as any other CLAUDE.md directive.

## Behavior Definitions

### Code Review Behavior
```markdown
When reviewing code or suggesting changes, query BookLib for relevant principles:
  Run: `node bin/booklib.js search "topic relevant to the code"`
  Cite the skill and principle in your review.
  Example: "> Refactored per Effective Kotlin: Item 1 (Limit Mutability)"
```

### Knowledge Capture Behavior
```markdown
When the user discovers a useful pattern, asks to remember something,
or you identify a reusable insight during a session:
  Run: `node bin/booklib.js capture --title "insight title" --type insight --tags relevant,tags`
  Confirm what was saved and how to find it later.
```

### Health Check Behavior
```markdown
When you notice code quality issues accumulating, skills producing
irrelevant suggestions, or the user mentions things feeling "off":
  Run: `node bin/booklib.js doctor`
  Report findings and suggest fixes.
```

### Search Before Answering Behavior
```markdown
When the user asks about best practices, patterns, or "how should I do X":
  First run: `node bin/booklib.js search "the user's question"`
  Use the results to ground your answer in the project's active skills.
  If no relevant results, answer from your own knowledge.
```

### Audit Behavior
```markdown
When asked to deeply review a specific file against a skill:
  Run: `node bin/booklib.js audit <skill-name> <file-path>`
  Present the audit findings organized by principle.
```

## How Behaviors Are Embedded

The behaviors block is inserted into every generated config file as part of the profile template (Spec: Config Profiles). Each profile includes the same behaviors block — it's not profile-specific.

The block is rendered as a `## BookLib Agent Behaviors` section with each behavior as a subsection.

## Tool-Specific Adjustments

| Tool | Command format | Notes |
|------|---------------|-------|
| Claude Code | `node bin/booklib.js search "..."` | Full CLI access |
| Gemini CLI | `node bin/booklib.js search "..."` | Full CLI access |
| Codex | `node bin/booklib.js search "..."` | Full CLI access |
| Cursor | Plain text description only | No CLI — Cursor can't run shell commands from rules |
| Copilot | Plain text description only | No CLI — Copilot reads instructions but can't execute |

For tools without CLI access, behaviors are phrased as guidance:
```markdown
When reviewing code, consider the principles from the active skills listed below.
Focus on: [skill focus areas extracted from tags].
```

## Files Changed

- Create: `lib/agent-behaviors.js` — exports `renderBehaviors(tool)` that returns the markdown block
- Modify: `lib/profiles/*.md` — include `{{agent_behaviors}}` placeholder
- Modify: `lib/project-initializer.js` — call `renderBehaviors()` when filling templates

Does **not** touch: search pipeline, wizard flow, indexer, CLI commands.

## Dependency

Requires **Spec: Config Profiles** to be implemented first (provides the template system).
