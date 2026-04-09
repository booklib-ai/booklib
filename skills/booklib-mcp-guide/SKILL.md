---
name: booklib-mcp-guide
version: "1.0"
license: MIT
tags: [meta, mcp, tools, agent-guide]
description: "Use when working with BookLib MCP tools. Reference for lookup, review, remember, verify, guard — parameters, workflows, and anti-patterns."
---

# BookLib MCP Tool Guide

BookLib exposes 5 MCP tools to AI coding agents. Each tool has a single purpose. This guide covers when to call each one, what parameters to pass, and common workflows.

## Tool Reference

| Tool | When to call | Key params |
|------|-------------|------------|
| `lookup` | Before working with unfamiliar APIs or post-training deps | `query` (required), `file`, `limit`, `source` |
| `review` | User asks for deep code review of a specific file | `skill_name`, `file_path` (both required) |
| `remember` | User says "remember this", "capture", or makes a team decision | `title` (required), `content`, `type`, `tags` |
| `verify` | After writing code that uses unfamiliar or new APIs | `file_path` (required) |
| `guard` | After writing code that touches architecture or API choices | `file_path` (required) |

## Decision Tree

```
Need current docs for a post-training library  -> lookup
Need a full expert review of a file            -> review
User wants to save a decision or insight       -> remember
Code uses unknown imports                      -> verify
Code might violate team rules                  -> guard
```

## Tool Details

### lookup

Searches across post-training corrections, team knowledge, and expert skills. Returns structured principles with source citations.

Parameters:
- `query` (string, required): What you need to know. Include the library name and task.
- `file` (string): Path to the file being worked on. Adds language and component context.
- `limit` (number): Maximum results. Default: 3.
- `source` (enum: all/skills/knowledge): Filter by source type.

Prioritization order: (1) post-training gap corrections, (2) team knowledge nodes, (3) expert skill principles.

### review

Audits a file against a named skill's principles. Returns structured findings with line references and citations.

Parameters:
- `skill_name` (string, required): The skill to review against (e.g., "effective-kotlin", "clean-code-reviewer").
- `file_path` (string, required): Path to the file to review.

### remember

Creates a searchable knowledge node. Automatically indexed and auto-linked to related nodes.

Parameters:
- `title` (string, required): Short descriptive title.
- `content` (string): Detailed description in markdown.
- `type` (enum: insight/decision/pattern/note/research): Node type. Default: "insight".
- `tags` (string): Comma-separated tags.
- `links` (string): Link targets as "target:edge-type" pairs.

### verify

Checks if a file's imports are covered by BookLib's index. Flags unknown post-training APIs that may need current docs.

Parameters:
- `file_path` (string, required): Path to the source file.

Returns: list of unknown imports with suggested documentation URLs.

### guard

Checks if code contradicts captured team decisions. Compares code patterns against decision nodes.

Parameters:
- `file_path` (string, required): Path to the source file.

Returns: list of contradictions with the violated decision and source.

## Common Workflows

### 1. Gap detection and resolution

```
verify file.ts            -> finds unknown import "@stripe/stripe-js"
lookup "stripe js v5 api" -> returns current v5 docs
                          -> write correct code using current API
```

### 2. Team knowledge enforcement

```
write code                -> make architectural choice
guard file.ts             -> flags: contradicts "use PaymentIntents not Charges"
                          -> fix the violation, commit
```

### 3. Knowledge capture during work

```
discover a useful pattern -> remember "retry with exponential backoff" --type pattern
make a team decision      -> remember "use PaymentIntents not Charges" --type decision
```

## Anti-Patterns

- **Don't call `lookup` for standard patterns.** React hooks, Python builtins, Go stdlib -- you already know these. Only call for project-specific or post-training knowledge.
- **Don't call `verify` on stdlib imports.** Standard library imports are always known. Only check third-party imports.
- **Don't call `remember` for ephemeral notes.** Only capture durable decisions, patterns, and insights that future sessions should know about.
- **Don't call `review` without a specific skill.** The skill_name parameter is required -- pick the most relevant one or use "clean-code-reviewer" as default.
- **Don't over-call tools.** One `lookup` per topic is enough. Don't repeat the same query hoping for different results.

## CLI-Only Commands (Not MCP Tools)

These features are available via the `booklib` CLI but not exposed as MCP tools:

- `booklib connect <path>` -- connect a documentation source
- `booklib connect github releases <repo>` -- index GitHub changelogs
- `booklib connect notion database <id>` -- index Notion pages
- `booklib link <from> <to> --type <edge>` -- connect two knowledge nodes
- `booklib save-state --goal "..." --next "..."` -- save session for handoff
- `booklib nodes list` / `booklib nodes show <id>` -- list and inspect knowledge
- `booklib gaps` / `booklib resolve-gaps` -- detect and fix knowledge gaps
- `booklib analyze` -- show affected files and post-training APIs
- `booklib doctor` -- health check
