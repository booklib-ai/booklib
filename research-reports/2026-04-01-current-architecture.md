# BookLib — Current Architecture & Value Map
*April 1, 2026 | Reflects the actual state of the codebase after Specs 1-3 + MCP architecture overhaul*

---

## What BookLib Is

BookLib is a local knowledge engine that gives AI coding agents access to expert knowledge from real books. It sits between the user's AI tool (Claude, Cursor, Copilot, etc.) and a curated library of distilled principles — so the agent doesn't just rely on its training data but applies specific, citable guidance.

It is **not** a static file installer. It's a search engine, knowledge graph, and MCP tool server that runs locally with zero cloud dependencies.

---

## Core Value Propositions

### 1. Expert knowledge the model doesn't have

The model knows "how to write Java" but not "Item 7 of Effective Java says prefer method references to lambdas" or "Clean Code Chapter 3: a function should do one thing." BookLib's 24 bundled skills are distilled from specific books by specific authors — the agent applies them with citations.

**How it's implemented:**
- 24 SKILL.md files in `skills/` directory, each with XML-tagged sections (`<core_principles>`, `<anti_patterns>`, `<examples>`)
- Parsed by `lib/engine/parser.js` which extracts semantic chunks per XML tag
- Each skill has frontmatter: `name`, `description`, `tags`, `version`, `license`
- Skills are installed to `~/.claude/skills/` for Claude Code native loading

**Key files:** `skills/*/SKILL.md`, `lib/engine/parser.js`, `lib/skill-fetcher.js`

---

### 2. Hybrid search across all knowledge

Users and agents query BookLib with natural language. The search pipeline finds the most relevant principles across all skills and personal knowledge nodes.

**How it's implemented (Spec 2 — completed):**

```
Query → Query Expander → [BM25 + Vector Search] → RRF Fusion → Cross-Encoder Reranker → Results
```

- **Query Expander** (`lib/engine/query-expander.js`): generates keyword variants + "best practices for X" + "how to X" expansions
- **BM25 Index** (`lib/engine/bm25-index.js`): Robertson BM25 with k1=1.5, b=0.75. Stored as `.booklib/bm25.json`
- **Vector Search** (`lib/engine/searcher.js`): `all-MiniLM-L6-v2` embeddings via `@huggingface/transformers`, stored in vectra index
- **SRAG Prefix** (`lib/engine/indexer.js:buildMetadataPrefix()`): each chunk's embedding includes `[skill:X] [type:Y] [tags:Z]` prefix for domain-aware vector space
- **Reciprocal Rank Fusion** (`lib/engine/rrf.js`): merges BM25 + vector results. Original query gets 2x weight, expanded queries get 1x
- **Cross-Encoder Reranker** (`lib/engine/reranker.js`): `Xenova/ms-marco-MiniLM-L-6-v2` rescores top-20 candidates
- **Display Scores** (`lib/engine/searcher.js:addDisplayScores()`): rank-based percentages (1st=100%, 2nd=50%, etc.) since raw reranker scores saturate at ~1.0

**Key files:** `lib/engine/searcher.js`, `lib/engine/indexer.js`, `lib/engine/bm25-index.js`, `lib/engine/rrf.js`, `lib/engine/reranker.js`, `lib/engine/query-expander.js`

---

### 3. Personal knowledge graph

Beyond books, users capture their OWN insights — architecture decisions, patterns they discover, team conventions. These become searchable alongside book knowledge and linkable to skills.

**How it's implemented (Spec 3 — completed):**

- **Nodes**: gray-matter markdown files in `~/.booklib/knowledge/nodes/`. Each has `id`, `type` (insight, note, research, decision), `title`, `tags`, `content`
- **Edges**: `~/.booklib/knowledge/graph.jsonl` — typed relationships (`see-also`, `applies-to`, `extends`, `implements`, `contradicts`, `inspired-by`, `supersedes`, `depends-on`)
- **Capture**: `booklib capture --title "X" --type insight --tags a,b --links "skill:edge-type"` creates a node + edges in one command
- **Graph-augmented search**: `booklib search "query" --graph` runs hybrid search, then traverses one-hop edges from results to find linked skills/nodes. Only follows discovery-relevant edge types (`see-also`, `applies-to`, `extends`)
- **Traversal**: BFS with configurable max hops (`lib/engine/graph.js:traverseEdges()`)

**Key files:** `lib/engine/graph.js`, `bin/booklib.js` (capture command), `lib/engine/searcher.js` (_appendGraphResults)

---

### 4. MCP integration — agent uses BookLib automatically

For 10 out of 13 supported tools, BookLib exposes its capabilities as MCP tools. The agent discovers them automatically and calls them when relevant.

**How it's implemented:**

- **MCP Server** (`bin/booklib-mcp.js`): 8 tools exposed via stdio transport
  - `search_skills` — hybrid search across skill library
  - `search_knowledge` — search skills + personal knowledge graph
  - `audit_content` — deep file review against a named skill
  - `get_context` — build compiled context for a task with graph injection
  - `create_note` — create + immediately index a knowledge node
  - `list_nodes` — list knowledge graph nodes
  - `link_nodes` — create typed edges between nodes
  - `save_session_state` — save progress for multi-agent handoff

- **Tool descriptions are trigger-oriented**: each description starts with WHEN to use it, not just WHAT it does. E.g., `create_note`: "Use when the user discovers a useful pattern, says 'remember this', 'take a note', or 'capture this insight'."

- **MCP Config Writer** (`lib/mcp-config-writer.js`): generates tool-specific config files for all 10 MCP-capable tools:

  | Tool | Config Path | Root Key |
  |------|------------|----------|
  | Claude Code | `.claude/settings.json` | `mcpServers` |
  | Copilot (VS Code) | `.vscode/mcp.json` | `servers` |
  | Cursor | `.cursor/mcp.json` | `mcpServers` |
  | Gemini CLI | `.gemini/settings.json` | `mcpServers` |
  | Codex | `.codex/config.toml` | `[mcp_servers]` |
  | Windsurf | `~/.codeium/windsurf/mcp_config.json` (global) | `mcpServers` |
  | Roo Code | `.roo/mcp.json` | `mcpServers` |
  | Goose | `.goose/config.yaml` | `mcp_servers` |
  | Zed | `.zed/settings.json` | `context_servers` |
  | Continue | `.continue/mcpServers/booklib.yaml` | YAML |

- **Instinct block** (`lib/instinct-block.js`): 5-10 lines of behavioral triggers injected into each tool's config file, telling the agent WHEN to reach for BookLib tools. MCP-capable tools reference tool names (`search_skills`), non-MCP tools reference CLI commands (`booklib search`).

**Key files:** `bin/booklib-mcp.js`, `lib/mcp-config-writer.js`, `lib/instinct-block.js`

---

### 5. Multi-tool config generation

One `booklib init` command configures all detected AI tools with clean, concise config files.

**How it's implemented:**

- **Agent Detector** (`lib/agent-detector.js`): checks project directories (`.cursor/`, `.roo/`, `.junie/`), file signals (`opencode.toml`), PATH binaries (`cursor`, `gemini`), and VS Code extensions (`github.copilot*`) to find which tools the user has
- **Profile Templates** (`lib/profiles/*.md`): 5 activity-based templates (software-development, writing-content, research-analysis, design, general) that define the SECTION STRUCTURE of config files with `{{stack}}`, `{{skills_table}}`, `{{agent_behaviors}}`, `{{references}}` variables
- **Config Assembler** (`lib/project-initializer.js:_renderFromProfile()`): fills template variables with:
  - Stack info from project detection
  - Skill table from frontmatter only (`_buildSkillTable()` — reads `name`, `description`, `tags`, NOT full content)
  - Instinct block from `lib/instinct-block.js`
  - References from `TOOL_DOCS` map (links to official docs for each tool's config format)
- **Output size**: 30-60 lines per config file. Down from 3,000-10,000 lines in the old architecture.

**Config file contents:**
```
Profile template (section headings — user fills in)
  ## Overview, ## Stack, ## Conventions, ## Architecture Decisions, ...
BookLib section (auto-generated, between markers)
  Instinct block (5-10 lines)
  Skill table (N lines, metadata only)
  References (3 lines with official docs links)
```

**Key files:** `lib/project-initializer.js`, `lib/profiles/*.md`, `lib/agent-detector.js`, `lib/instinct-block.js`

---

### 6. Setup wizard

Interactive guided setup that detects the project, recommends skills, configures tools, and builds the search index.

**How it's implemented:**

- **UI**: `@clack/prompts` — colors, spinners, arrow-key selection, animated progress
- **Flow**: banner → project detection → profile selection → health check (warns about 200+ skills) → tool detection (with VS Code extension scanning) → index build (with per-file progress counter) → skill recommendation from search index → install + cleanup offer → MCP config writing → config file writing → summary
- **Recommendation engine**: after index build, queries `BookLibSearcher.search()` with the project description. Aggregates results by skill name, shows top 10 with match scores and matching chunk snippets for explanation.
- **Skill install**: three-tier lookup via `installSkill()` — checks `~/.claude/skills/` (already installed) → `<package>/skills/` (bundled) → `~/.booklib/cache/` (community cached)
- **Health check**: if `countAllSlots() > 32`, warns about context overload and offers cleanup after recommendations

**Key files:** `lib/wizard/index.js`, `lib/wizard/prompt.js`, `lib/wizard/project-detector.js`, `lib/wizard/skill-recommender.js`

---

### 7. Doctor diagnostic + repair

`booklib doctor` detects problems and `booklib doctor --cure` fixes them automatically.

**How it's implemented:**

- **Diagnostic engine** (`lib/engine/doctor.js`): 6 checks
  1. Slot overload — installed skills > 32 limit
  2. Oversized config files — CLAUDE.md > 500 lines with BookLib markers
  3. Missing search index — vectra index doesn't exist
  4. Missing config files — tools configured but config files absent
  5. Stale skills — installed 30+ days with zero usage
  6. Orphaned skills — installed but not in any catalog

- **Cure mode**: `--cure` auto-fixes missing index (rebuilds it), reports stale/orphaned skills for manual review

**Key files:** `lib/engine/doctor.js`, `bin/booklib.js` (doctor command)

---

### 8. Session management + multi-agent handoff

Agents can save progress and hand off to other agents across sessions.

**How it's implemented:**

- **Save/resume**: `booklib save-state --goal "..." --next "..."` writes session snapshot to `.booklib/sessions/<branch>.md`
- **Recovery**: `booklib recover-auto` checks session files → parent lineage → git commits
- **Coordination**: `booklib sessions-merge`, `sessions-lineage`, `sessions-compare` for multi-agent workflows
- **14 subcommands**: cleanup, diff, find, search, tag, validate, report, create, history, encrypt, summarize

**Key files:** `lib/engine/handoff.js`, `lib/engine/session-manager.js`, `lib/engine/session-coordinator.js`

---

## Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Runtime | Node.js ≥18, ESM | Everything |
| Embeddings | `@huggingface/transformers` v3.4 + `all-MiniLM-L6-v2` | Vector search |
| Vector store | `vectra` | Local vector index |
| BM25 | Custom implementation | Keyword search |
| Cross-encoder | `ms-marco-MiniLM-L-6-v2` | Reranking |
| Frontmatter | `gray-matter` | SKILL.md parsing |
| MCP | `@modelcontextprotocol/sdk` | MCP server |
| CLI UI | `@clack/prompts` | Wizard interactions |
| Glob matching | `minimatch` | File pattern matching |
| Tests | `node --test` (built-in) | 62 tests |

**Total dependencies:** 6 runtime (transformers, vectra, gray-matter, minimatch, @modelcontextprotocol/sdk, @clack/prompts)

---

## What's NOT Implemented (claimed but missing)

| Claim | Reality |
|-------|---------|
| "Auto-injection via PreToolUse hook" (website + README) | Only usage-tracking hook exists. No content injection hook. MCP replaces this need for 10/13 tools. |
| "258+ discoverable skills" (README badge) | Discovery engine exists but no external sources are configured by default. `booklib discover` returns empty. |

---

## What's Next (from validated research)

| Priority | Feature | Effort | Value |
|----------|---------|--------|-------|
| P1 | Transformers.js v4 upgrade (4x faster indexing) | 0.5 day | Performance |
| P1 | Compact mode + skill content guidelines (ETH Zurich validated) | 1 day | Quality |
| P2 | Progressive disclosure (`--progressive` flag) | 1 day | Quality |
| P2 | MCP Server Cards (`.well-known/mcp/server-card.json`) | 0.5 day | Discovery |
| P2 | Codified Context paper citation | 2 hours | Positioning |
| P2 | Late chunking (+24% retrieval improvement) | 3-5 days | Quality |
| P3 | SEE early-exit reranking | 2-3 weeks | Performance |
