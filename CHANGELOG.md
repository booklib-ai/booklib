# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - 2026-04-08

### Added
- **Runtime micro-injection system** — PreToolUse/PostToolUse hooks inject 3-10 lines of context before/after code edits based on a pre-computed context map
- **Context map** — maps knowledge items to code scopes via filePatterns, codeTerms, importTriggers, functionPatterns; built during `booklib init`
- **PostToolUse contradiction detection** — checks written code against team constraints in real-time
- **Processing modes** — fast (BM25-only), local (Ollama), API (cloud LLM) with wizard setup
- **Local AI via Ollama** — real model reasoning with auto-detection and wizard setup help
- **Context7 connector** — auto-resolves post-training knowledge gaps via Context7 API
- **GitHub connector** — indexes releases, wiki, and discussions
- **Notion connector** — indexes pages, databases, and search results
- **Knowledge gap detection** — scans deps across 8 registries, checks publish dates against model training cutoff
- **Gap resolution chain** — Context7 → GitHub → manual suggestion, fully automated
- **Unknown import detection** — flags imports not covered by BookLib knowledge
- **Team decision contradiction detection** — checks code against captured team rules
- **Source management** — `booklib connect`, `booklib disconnect`, `booklib sources` for doc sources
- **Web connector** — scrapes documentation URLs into markdown for indexing
- **Local connector** — file watching with filters and incremental updates
- **Source type auto-detection** — heuristics identify PKM vaults, SDD specs, API docs
- **Pre-built index support** — instant setup via `@booklib/index` package (~93 MB)
- **Sprint workflow** — `/sprint` command with 18 personas, 4 rings, and self-correcting loops
- **XML principle extraction** — splits chunks into individual actionable principles
- **Structured MCP responses** — returns principles with context, not raw chunks
- **MCP priority lookup** — most relevant tool fires first
- **Auto-linker** — connects knowledge nodes to matching skills automatically
- **Universal markdown splitter** — atomic chunking with parent/sibling metadata
- **Sibling expansion** — pulls missing chunks when >=50% of siblings match a query
- **Relevance threshold** — reranker filters truly irrelevant results
- **GPU auto-detection** — batch embedding for faster indexing
- **Colored progress bar** — cyan/gray bar with elapsed time during doc indexing
- **Navigation legend** — colorful key hints on all interactive prompts (↑↓ navigate · space toggle · enter submit)
- **Friendly spinner messages** — "Picking the best skills for your stack..." instead of dry technical text
- **Auto-gitignore** — wizard adds derived BookLib files to .gitignore during init
- **`npm test` script** — `node --test` runs 760 tests
- **CI test gating** — tests run on every PR, push to main, and before npm publish

### Fixed
- **Batch vectra insert** — single disk write instead of 1368 individual read-modify-write cycles; save phase drops from 30s+ to <1s
- **Corrupt index recovery** — truncated index.json is detected and rebuilt instead of crashing
- **EBADF in tests** — CoreML fd2 redirect broke process.stderr permanently; replaced with clean console.warn + OS_ACTIVITY_MODE suppression
- **Scoped npm names** — `@types/react-dom` no longer crashes Context7 source registration
- **Progress bar line spam** — 500ms throttle prevents spinner from creating new lines
- **Saving phase UX** — spinner shows "Almost there, saving..." after progress hits 100%
- **Doc pre-selection** — all detected doc sources pre-selected in wizard (opt-out instead of opt-in)
- **Skill recommendation** — search query includes frameworks, language fallback always merges, pre-select only recommended skills, simplified labels
- **List indentation** — post-training deps and other lists visually nested under headers
- **12-language ecosystem support** — parsers for pubspec.yaml, Cargo.toml dev/build deps, pyproject.toml optional/Poetry, Package.swift, Directory.Packages.props, composer.json
- **Monorepo detection** — scans subdirectory manifests for frameworks
- **Self-referencing dep exclusion** — project's own package name filtered from gap detection
- **BM25 incremental append** — uses `bm25.add()` instead of rebuilding entire index
- **Template file filtering** — spec-template.md rules no longer treated as real decisions
- **Project-scoped context map** — global knowledge never auto-injects into project hooks

### Changed
- **760 tests** across 60 files (up from 62 tests in 2.0.0)
- **MCP tools renamed** — lookup, review_file, brief, remember, recalled, connect, save_progress
- **Package renamed** to `@booklib/core` (from `booklib`)
- **Wizard flow** — gap detection, doc indexing, context map building integrated into init

## [2.0.0] - 2026-04-01

### Breaking
- **Repo renamed** from `booklib-ai/booklib` to `booklib-ai/booklib`
- **npm package renamed** from `@booklib/skills` to `booklib` — install with `npm install -g booklib`
- **Config file generation** completely rewritten — generates 30-60 line files instead of 3,000-10,000 line content dumps. Old config files should be regenerated with `booklib init --reset`
- **`booklib fetch` and `booklib add` deprecated** — use `booklib install <name>` instead

### Added
- **Hybrid search pipeline (Spec 2)** — BM25 + vector search + Reciprocal Rank Fusion + cross-encoder reranking. 40-60% precision improvement over vector-only
- **SRAG metadata prefix embeddings** — each chunk's vector encodes domain context (`[skill:X] [type:Y] [tags:Z]`), 30% QA improvement (arxiv:2603.26670)
- **Knowledge graph (Spec 3)** — `booklib capture` creates knowledge nodes with typed edges, `--graph` flag augments search with one-hop graph traversal
- **MCP integration for 10 tools** — auto-configures MCP server for Claude Code, Cursor, Copilot (VS Code), Gemini CLI, Codex, Windsurf, Roo Code, Goose, Zed, Continue
- **Trigger-oriented MCP tool descriptions** — each tool description says WHEN to use it, not just what it does
- **Instinct block** — 5-10 lines of behavioral triggers in config files tell agents when to use BookLib tools
- **5 activity-based profiles** — software-development, writing-content, research-analysis, design, general
- **Config assembler** — profile template + instinct block + skill table + references = clean config file
- **Copilot detection** via VS Code extensions directory (`~/.vscode/extensions/github.copilot*`)
- **`booklib install <name>`** — unified install command with three-tier lookup (installed → bundled → cached)
- **`booklib doctor` diagnostic engine** — 6 checks (slot overload, oversized configs, missing index, stale skills, orphaned skills, missing config files) + `--cure` flag
- **`booklib init --reset`** — force re-run setup wizard
- **Rank-based display scores** — meaningful percentages instead of all-100% reranker saturation
- **Recommendation explanations** — wizard shows WHY each skill was recommended with matching chunk snippets
- **Safe config file handling** — `onFileConflict` callback before modifying existing files
- **Official docs references** — generated config files link to each tool's official documentation
- **Index progress callback** — `onProgress` in `indexDirectory()` for real-time feedback
- **Shared readline session** — `createSession()` eliminates race conditions in sequential prompts
- **@clack/prompts wizard UI** — colors, spinners, arrow-key selection, animated progress
- **`benchmark/RESEARCH.md`** — maps retrieval quality metrics to arxiv 2602.12430 claims

### Changed
- **13 supported AI tools** (up from 8): added Roo Code, OpenHands, Junie, Goose, OpenCode, Letta
- **24 bundled skills** (up from 22)
- **62 tests** across all modules
- **Wizard flow reordered** — index build before recommendations (uses search engine for recommendations instead of shallow description embeddings)

## [1.12.0] - 2026-03-30

### Added
- **`booklib init` Phase 2: MCP server setup** — after writing standards docs, `booklib init` now offers an interactive prompt to wire up the BookLib MCP server for Claude Code, Cursor, Gemini CLI, Codex, Zed, and Continue.dev
- **MCP config generation** — writes project-level config files: `.claude/settings.json`, `.cursor/mcp.json`, `.gemini/settings.json`, `.codex/config.toml`, `.zed/settings.json`, `.continue/mcpServers/booklib.yaml`; merges safely into existing configs without overwriting other MCP servers
- **`booklib-mcp` named bin** — `booklib-mcp` is now a first-class binary entry in `package.json`; MCP configs reference it directly by name
- **`--mcp-tool=X` flag** — skip the interactive prompt and specify tools directly (e.g. `booklib init --mcp-tool=claude,cursor`); selection persisted to `booklib.config.json`
- **Knowledge Graph** — unified node+edge model where any piece of knowledge (research, notes, decisions) and any part of your project (components, features) is a node; relationships are typed edges stored in `.booklib/knowledge/graph.jsonl`
- **`booklib note "<title>"`** — create a note node from `$EDITOR`, stdin pipe, or interactive input
- **`booklib dictate`** — type or dictate a note; AI structures the text, fixes grammar, extracts title and tags; `--raw` flag saves verbatim with no AI processing
- **`booklib save-chat`** — save the current agent conversation as a knowledge node; `--summarize` flag uses AI to extract key decisions and findings into a clean note with transcript attached
- **`booklib research "<topic>"`** — create a research stub node pre-populated with a template
- **`booklib component add <name> "<glob>"`** — define a project component with glob path patterns; component nodes replace `areas.yaml` (additive migration)
- **`booklib link <node1> <node2> --type <edge-type>`** — add a typed edge between any two nodes; edge types: `implements` · `contradicts` · `extends` · `applies-to` · `see-also` · `inspired-by` · `supersedes` · `depends-on`
- **`booklib nodes list`** / **`booklib nodes show <id>`** — list and inspect knowledge nodes
- **`booklib context --file <path>`** — graph-aware context injection: finds the file's owning component, traverses edges via BFS (up to 2 hops), combines with semantic search, injects book wisdom + personal knowledge together
- **PostToolUse hook** (`hooks/posttooluse-capture.mjs`) — fires after `WebFetch`/`WebSearch` tool calls and suggests saving captured knowledge as a node
- **`lib/engine/graph.js`** — node CRUD, edge append, BFS traversal with cycle prevention
- **`lib/engine/capture.js`** — node creation helpers: stdin, `$EDITOR`, interactive readline, Anthropic API structuring
- **`lib/engine/graph-injector.js`** — injection pipeline: semantic search + BFS graph traversal + dedup + ranking
- **Knowledge nodes indexed** — `booklib index` now indexes `.booklib/knowledge/nodes/` alongside skills; `booklib search` returns both with `📝` prefix for knowledge hits
- **`minimatch`** added as a runtime dependency for component path-glob matching

## [1.11.0] - 2026-03-30

### Added
- **Non-code domain support** — `booklib context` now works for product, writing, strategy, design, and legal domains using the same semantic extraction as code skills
- **6 new community skills in registry** — `article-writing`, `product-lens`, `market-research`, `investor-materials`, `brand-guidelines`, `web-design-guidelines` with accurate source URLs
- **`booklib scan --docs` mode** — prose quality checks (passive voice, unresolved placeholders, hedge words, user story completeness) for `.md`/`.txt` files
- **`writing-plans/audit.json`** — bundled static rules for markdown document scanning
- **New profiles** — `product`, `writer`, `strategist`, `designer`, `legal` roles added to `booklib profile` and `booklib swarm-config`
- **`skill-router` extended** — now routes non-code tasks to PM, legal, writing, strategy, brand, and web design skills; added 5 new routing rules and 3 conflict resolution entries
- **Prose sentence extraction** — `extractItems()` now splits long prose blocks by sentence boundary so non-code skill content surfaces as individual, rankable principles

### Fixed
- **Self-conflict bug** — `booklib context` no longer shows `skill vs skill` conflict warnings when the same skill name appears in both bundled and community index; deduplication by skill name now runs before conflict resolution
- **Community skills indexed** — `booklib index` now indexes `~/.booklib/skills/` after rebuilding the bundled index, so community skills appear in `booklib search` and `booklib context` results
- **YAML parse errors** — `booklib index` now skips malformed skill files with a warning instead of aborting the entire index rebuild

## [1.10.0] - 2026-03-28

### Added
- **Rules system** — Standalone rule files for Cursor and other AI editors
- **Standalone `--hooks` flag** — Install hooks independently of skills
- **Landing page update** — Improved GitHub Pages documentation

### Changed
- Multi-language README support (中文, 日本語, 한국어, Português)
- README overhaul for v1.10.0 with improved clarity and examples

### Fixed
- Book covers now load via Google Books JSON API (eliminates false-positive placeholders)
- Cover image detection improved to skip 1×1 pixel placeholders

## [1.9.0] - 2026-02-27

### Added
- **Agents system** — `@python-reviewer`, `@ts-reviewer`, `@architecture-reviewer`, and more
- **Cursor support** — Install skills and rules to `.cursor/rules/` for Cursor IDE
- **Installation profiles** — Quick-start profiles for common stacks (python, ts, jvm, rust, architecture, data, ui, lean, core)
- **Slash commands** — `/effective-python`, `/design-patterns`, etc. for explicit skill invocation
- **Hook system** — Auto-suggestion when asking for code reviews
- **GitHub Pages site** — Interactive skill browser with book covers

### Changed
- AGENTS.md rewritten with profiles and cross-platform setup
- README structure reorganized around profiles and tiers

### Removed
- Hardcoded skill count (now dynamic)

## [1.8.0] - 2026-02-26

### Added
- **Installation profiles** — Platform-specific quick-install (e.g., `--profile=ts`, `--profile=python`)
- **Benchmark suite** — Performance testing infrastructure
- **Skill quality checker** — `npx booklib check <skill-name>`

### Changed
- Project logo added and displayed in README
- Community health files added
- NPM ignore list improved

## [1.7.0] - 2026-02-24

### Added
- **Agents system** — `@booklib-reviewer`, `@python-reviewer`, `@ts-reviewer` for autonomous code review
- **Skill-router meta-skill** — Auto-routing to best skill based on context
- **GitHub Actions workflows** — Automated testing and release pipeline
- **Skill evaluation framework** — `evals.json` test cases for quality assurance

### Changed
- All skills upgraded to **Platinum** quality (13/13 checks)
- Scripts added to all skills for practical examples
- Skill structure standardized with examples/ and references/ directories

## [1.6.0] - 2026-02-20

### Added
- **Slash commands system** — Explicit skill invocation without relying on auto-trigger
- **Skill verification** — `npx booklib eval <skill-name>` for running test cases

## [1.5.0] - 2026-02-18

### Added
- `spring-boot-in-action` skill — Enterprise Java best practices
- Spring Boot patterns and architecture guidance

## [1.4.0] - 2026-02-16

### Added
- `effective-typescript` skill — Dan Vanderkam's TypeScript best practices
- `programming-with-rust` skill — Donis Marshall's practical Rust patterns
- `rust-in-action` skill — Tim McNamara's systems programming with Rust

### Changed
- Upgraded to Platinum quality across new skills

## [1.3.0] - 2026-02-15

### Added
- **Skill-router** — Meta-skill that automatically selects the best skill for your task
- Improved skill discovery mechanism
- Better error messages for missing skills

## [1.2.0] - 2026-02-14

### Added
- GitHub Pages site with skill browser
- Animated demo GIF
- Improved README with better visual hierarchy

## [1.1.0] - 2026-02-13

### Added
- NPM version, downloads, and license badges
- Better documentation structure
- CLAUDE.md with project overview

## [1.0.0] - 2026-02-10

### Added
- **Initial release** with 18 core skills:
  - `animation-at-work`
  - `clean-code-reviewer`
  - `data-intensive-patterns`
  - `data-pipelines`
  - `design-patterns`
  - `domain-driven-design`
  - `effective-java`
  - `effective-kotlin`
  - `effective-python`
  - `kotlin-in-action`
  - `lean-startup`
  - `microservices-patterns`
  - `refactoring-ui`
  - `storytelling-with-data`
  - `system-design-interview`
  - `using-asyncio-python`
  - `web-scraping-python`
  - Plus 4 additional skills

- **Installation system** — NPM-based skill installation
- **Skill structure** — Standardized SKILL.md format with YAML frontmatter
- **Auto-triggering** — Skills load automatically based on file context
- **MIT License** — Open-source and permissive
- **Security policy** — Responsible disclosure guidelines
- **Code of Conduct** — Community standards

---

## Release Notes

For detailed release notes, see [GitHub Releases](https://github.com/booklib-ai/booklib/releases).

## Versioning Policy

This project follows **Semantic Versioning**:
- **MAJOR** — Breaking changes to skill APIs or skill removal
- **MINOR** — New skills, new features, non-breaking improvements
- **PATCH** — Bug fixes, documentation improvements, skill enhancements

New skills are added regularly and will increment the MINOR version.
