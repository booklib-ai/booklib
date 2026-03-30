# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.12.0] - 2026-03-30

### Added
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
- **Skill quality checker** — `npx @booklib/skills check <skill-name>`

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
- **Skill verification** — `npx @booklib/skills eval <skill-name>` for running test cases

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

For detailed release notes, see [GitHub Releases](https://github.com/booklib-ai/skills/releases).

## Versioning Policy

This project follows **Semantic Versioning**:
- **MAJOR** — Breaking changes to skill APIs or skill removal
- **MINOR** — New skills, new features, non-breaking improvements
- **PATCH** — Bug fixes, documentation improvements, skill enhancements

New skills are added regularly and will increment the MINOR version.
