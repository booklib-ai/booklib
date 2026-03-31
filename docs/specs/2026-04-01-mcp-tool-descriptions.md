# Spec: MCP Tool Description Improvement
*Date: 2026-04-01 | Status: Draft*

## Problem
Current MCP tool descriptions say WHAT the tool does but not WHEN to use it. The agent sees "Creates a knowledge node" but doesn't know to call it when the user says "remember this."

## Solution
Rewrite all 8 tool descriptions in `bin/booklib-mcp.js` to be trigger-oriented — each description starts with WHEN to use it, then explains WHAT it does.

## Changes

| Tool | Current | New |
|------|---------|-----|
| `search_skills` | "Perform a semantic search across the BookLib expert library" | "Use BEFORE reviewing code, answering best-practices questions, or suggesting patterns. Searches BookLib's expert library and returns relevant principles with citations." |
| `search_knowledge` | "Semantic search across book skills and personal knowledge graph nodes" | "Use for broader search that includes personal knowledge captured in this project. Returns results from both expert skills and saved insights/notes." |
| `audit_content` | "Performs a systematic expert audit of a file or text" | "Use when the user asks for deep code review or quality analysis of a specific file. Audits against a named skill's principles and returns structured findings." |
| `save_session_state` | "Saves the current agent's progress..." | "Use when handing off to another agent or ending a long session. Saves progress, goals, and next steps so another agent can resume." |
| `get_context` | "Builds a compiled context prompt combining relevant book wisdom..." | "Use at session start or when switching tasks to load relevant BookLib context for the current work. Returns combined wisdom from matched skills and knowledge graph." |
| `create_note` | "Creates a knowledge node of type 'note'..." | "Use when the user discovers a useful pattern, says 'remember this', 'take a note', or 'capture this insight'. Creates a searchable knowledge node." |
| `list_nodes` | "Lists all knowledge graph nodes..." | "Use when the user asks 'what have I captured?' or wants to see saved knowledge. Lists all notes, insights, and research nodes." |
| `link_nodes` | "Creates a typed edge between two knowledge graph nodes" | "Use when the user says two concepts are related or wants to connect knowledge. Creates a typed relationship (see-also, applies-to, extends, etc.)." |

## Files Changed
- Modify: `bin/booklib-mcp.js` — rewrite 8 `description` fields

## No Dependencies
Can be implemented independently.
