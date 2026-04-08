# BookLib MCP Guide Skill — Design Spec

## Goal

Create a bundled skill that serves as the on-demand reference for BookLib's 9 MCP tools. Slim CLAUDE.md and all agent configs to ~15 lines, pointing agents to this skill for deeper guidance.

## Problem

Current state: CLAUDE.md dumps 80 lines of BookLib instructions into the agent's context on every task — most of it irrelevant to what the agent is doing right now. This wastes ~50 instructions of the agent's ~150-instruction compliance budget.

Target state: CLAUDE.md has a 4-line instinct block ("when X → tool Y") plus one line pointing to the skill. The skill loads only when the agent needs detailed tool guidance.

## Architecture

Progressive disclosure (per Anthropic best practices):
- **Level 1 (always loaded):** Instinct block in CLAUDE.md — 5 lines, ~50 tokens
- **Level 2 (on demand):** `booklib-mcp-guide` skill — loaded when agent searches "booklib mcp tools" — ~200 lines, ~2k tokens
- **Level 3 (as needed):** Individual tool parameter details available via `booklib --help`

## Skill: `skills/booklib-mcp-guide/SKILL.md`

### Frontmatter

```yaml
---
name: booklib-mcp-guide
version: "1.0"
license: MIT
tags: [meta, mcp, tools, agent-guide]
description: "Reference for BookLib MCP tools. Covers when to call each tool, parameters, common workflows, and anti-patterns for AI coding agents."
---
```

Description: 139 chars (under 250 truncation threshold).

### Body structure (~200 lines)

**Section 1: Tool Reference (compact table)**

| Tool | When to call | Key params |
|------|-------------|------------|
| `lookup` | Before working with unfamiliar APIs or post-training deps | `query` (required), `file`, `limit` |
| `review` | User asks for deep code review of a specific file | `skill_name`, `file_path` |
| `brief` | Starting a new task or switching context (call once, not per edit) | `task`, `file` |
| `remember` | User says "remember this", "capture", or makes a team decision | `title`, `type`, `tags` |
| `recalled` | User asks "what did we capture?" or wants to see saved knowledge | `type_filter` |
| `connect` | Two knowledge nodes are related, user wants to link them | `from`, `to`, `type` |
| `save` | Handing off to another agent or ending a long session | `goal`, `next`, `progress` |
| `verify` | After writing code that uses unfamiliar or new APIs | `file_path` |
| `guard` | After writing code that touches architecture or API choices | `file_path` |

### Renames from 2.0.0

| Old name | New name | Reason |
|----------|----------|--------|
| `review_file` | `review` | "file" redundant — it's always a file |
| `save_progress` | `save` | Simpler, matches agent intent |
| `check_imports` | `verify` | Removes noise prefix, single word |
| `check_decisions` | `guard` | Expresses protection intent |

Old names kept as aliases in `booklib-mcp.js` for backward compatibility.

**Section 2: Decision Tree**

```
Need current docs for a post-training library  → lookup
Need a full expert review of a file            → review
Starting a new task, need context              → brief
User wants to save a decision or insight       → remember
User asks "what have we captured?"             → recalled
Want to link two pieces of knowledge           → connect
Code uses unknown imports                      → verify
Code might violate team rules                  → guard
Ending session or handing off                  → save
```

**Section 3: Common Workflows**

Three concrete sequences:

1. **Gap detection → resolution:**
   `verify` on file → finds unknown API → `lookup` with the library name → use returned docs to write correct code

2. **Team knowledge enforcement:**
   Write code → `guard` on file → see contradictions → fix → commit

3. **Context briefing:**
   `brief` with task + file path → read expert + team knowledge → implement → `remember` any new decisions made during the work

**Section 4: Anti-patterns**

- Don't call `lookup` for standard language features you already know (React hooks, Python builtins, Go stdlib)
- Don't call `brief` on every edit — once per task switch is enough
- Don't call `verify` on standard library imports
- Don't call `remember` for ephemeral observations — only durable decisions, patterns, and insights
- Don't use aggressive trigger language in tool descriptions — causes overtriggering on Claude 4.6

## CLAUDE.md Changes

Replace all content between `<!-- booklib-standards-start -->` and `<!-- booklib-standards-end -->` with:

```markdown
<!-- booklib-standards-start -->
## Stack
javascript (Node.js >= 18, ES modules)

## Commands
- Install: `npm install`
- Test: `npm test`
- Build index: `booklib index`
- Health check: `booklib doctor`

## BookLib
BookLib MCP tools detect what your AI doesn't know and fix it at runtime.
- When working with unfamiliar APIs or post-training deps → lookup
- When starting a new task in an unfamiliar area → brief
- When user says "remember/capture this" → remember
- For full tool reference → `booklib search "booklib mcp tools"`

## Active Skills
| Skill | Focus | Tags |
|-------|-------|------|
| clean-code-reviewer | Clean Code principles | all-languages, quality, naming, refactoring |
| skill-router | Routes to best skill for any task | meta, routing, agent-skills |
| booklib-mcp-guide | MCP tool reference and workflows | meta, mcp, tools |
<!-- booklib-standards-end -->
```

Lines 1-49 (the `<corrections>`, `<workflow>`, `<navigation_map>`, `<universal_indexer>` blocks) are removed — they dump CLI commands that belong in the skill or `--help`, not in always-loaded context.

## Instinct Block Update

In `lib/instinct-block.js`, add one line to the MCP-capable agent block:

```
- For full tool reference → booklib search "booklib mcp tools"
```

This ensures ALL projects initialized with `booklib init` get the skill pointer, not just the BookLib repo.

## Other Agent Config Updates

The same slim block replaces the content in:
- `.kiro/steering/booklib-standards.md`
- `.gemini/context.md`
- `.github/copilot-instructions.md`

These use the same `<!-- booklib-standards-start/end -->` markers and get the same content.

## What This Does NOT Change

- `bin/booklib-mcp.js` — tool names renamed (review_file→review, save_progress→save, check_imports→verify, check_decisions→guard), old names kept as aliases
- `lib/mcp-config-writer.js` — MCP registration stays as-is
- `hooks/` — hook files stay as-is
- `lib/project-initializer.js` — uses `renderInstinctBlock()` which we update

## Validation

After implementation:
1. `booklib search "booklib mcp tools"` returns the new skill
2. `booklib search "when to call lookup"` returns relevant content
3. CLAUDE.md is under 30 lines
4. `npm test` passes (760 tests)
5. The skill loads when an agent searches for MCP guidance
