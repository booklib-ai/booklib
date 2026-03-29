<p align="center">
  <a href="README.md">English</a> · <a href="README.zh-CN.md">中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.pt-BR.md">Português</a> · <a href="README.uk.md">Українська</a>
</p>

<p align="center">
  <img src="assets/logo.svg" width="100" alt="booklib-ai skills"/>
</p>

<h1 align="center">booklib-ai/skills</h1>

<p align="center">
  An open knowledge ecosystem for AI coding agents.<br/>
  Curated skills from canonical books — plus community discovery, semantic search, and orchestrator compatibility.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@booklib/skills"><img src="https://img.shields.io/npm/v/@booklib/skills.svg" alt="npm version"/></a>
  <a href="https://www.npmjs.com/package/@booklib/skills"><img src="https://img.shields.io/npm/dw/@booklib/skills.svg" alt="downloads"/></a>
  <a href="https://github.com/booklib-ai/skills/stargazers"><img src="https://img.shields.io/github/stars/booklib-ai/skills?style=flat" alt="stars"/></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="license"/></a>
  <a href="https://github.com/booklib-ai/skills/blob/main/CHANGELOG.md"><img src="https://img.shields.io/badge/Actively%20Maintained-✓-brightgreen" alt="actively maintained"/></a>
  <a href="https://github.com/booklib-ai/skills/actions"><img src="https://img.shields.io/github/actions/workflow/status/booklib-ai/skills/check.yml?branch=main" alt="CI/CD status"/></a>
</p>

<p align="center">
  <b>22 bundled skills</b> &nbsp;·&nbsp; <b>258+ discoverable</b> &nbsp;·&nbsp; <b>8 agents</b> &nbsp;·&nbsp; <b>obra/superpowers &amp; ruflo compatible</b>
</p>

---

## What it is

BookLib packages expert knowledge from canonical programming books into skills that AI agents can apply directly to your code. It ships with 22 curated, evaluated skills — and a discovery engine that can find, index, and inject hundreds more from the community.

**Two layers:**

| Layer | What it does |
|-------|-------------|
| **Bundled library** | 22 skills from canonical books, pre-indexed, ready to use out of the box |
| **Discovery ecosystem** | Finds and fetches skills from GitHub repos, community registries, and npm packages |

BookLib is not a static install. It's a local knowledge engine: semantic search over skill content, automatic context injection via hooks, role-based profiles for swarm agents, and a sync bridge that makes every fetched skill available to any Claude Code-compatible orchestrator.

---

## How Skills Activate

| Mechanism | What triggers it | Detail |
|-----------|-----------------|--------|
| **PreToolUse hook** | Editing a file matching a skill's `filePattern` | Injects only relevant chunks — fine-grained, automatic, silent |
| **Skill tool** | `Skill("effective-kotlin")` | Full skill dump on demand — used by orchestrators and subagents |
| **Search** | `booklib search "<concept>"` | Semantic vector search — returns the most relevant chunks |
| **Audit** | `booklib audit <skill> <file>` | Applies a skill's principles to a specific file |

The **hook** is the fine-grained layer. After `booklib hooks install`, it fires on every `Read`/`Edit`/`Write`/`Bash` call, matches the file path against skill patterns, and silently injects the relevant skill sections into context — no manual invocation needed. Edit a `.kt` file and effective-kotlin appears. Edit a `.py` file and effective-python appears.

The **Skill tool** is the coarse layer — a full knowledge dump for orchestrator subagents that need an entire skill domain up front.

---

## Quick Start

```bash
# Install the CLI
npm install -g @booklib/skills

# Build the local search index
booklib index

# Install the PreToolUse hook — auto-injects relevant skills when you edit files
booklib hooks install

# Search for wisdom by concept
booklib search "how to handle null values in Kotlin"

# Discover and install all trusted skills (bundled + community)
booklib setup

# Sync all fetched skills → available to Claude Code's Skill tool and orchestrators
booklib sync
```

---

## Bundled Skills

| Skill | Book | Author |
|-------|------|--------|
| [animation-at-work](./skills/animation-at-work/) | *Animation at Work* | Rachel Nabors |
| [clean-code-reviewer](./skills/clean-code-reviewer/) | *Clean Code* | Robert C. Martin |
| [data-intensive-patterns](./skills/data-intensive-patterns/) | *Designing Data-Intensive Applications* | Martin Kleppmann |
| [data-pipelines](./skills/data-pipelines/) | *Data Pipelines Pocket Reference* | James Densmore |
| [design-patterns](./skills/design-patterns/) | *Head First Design Patterns* | Freeman & Robson |
| [domain-driven-design](./skills/domain-driven-design/) | *Domain-Driven Design* | Eric Evans |
| [effective-java](./skills/effective-java/) | *Effective Java* (3rd ed) | Joshua Bloch |
| [effective-kotlin](./skills/effective-kotlin/) | *Effective Kotlin* (2nd ed) | Marcin Moskała |
| [effective-python](./skills/effective-python/) | *Effective Python* (3rd ed) | Brett Slatkin |
| [effective-typescript](./skills/effective-typescript/) | *Effective TypeScript* (2nd ed) | Dan Vanderkam |
| [kotlin-in-action](./skills/kotlin-in-action/) | *Kotlin in Action* (2nd ed) | Elizarov & Isakova |
| [lean-startup](./skills/lean-startup/) | *The Lean Startup* | Eric Ries |
| [microservices-patterns](./skills/microservices-patterns/) | *Microservices Patterns* | Chris Richardson |
| [programming-with-rust](./skills/programming-with-rust/) | *Programming with Rust* | Donis Marshall |
| [refactoring-ui](./skills/refactoring-ui/) | *Refactoring UI* | Wathan & Schoger |
| [rust-in-action](./skills/rust-in-action/) | *Rust in Action* | Tim McNamara |
| [skill-router](./skills/skill-router/) | Meta-skill — routes to the right skill automatically | booklib-ai |
| [spring-boot-in-action](./skills/spring-boot-in-action/) | *Spring Boot in Action* | Craig Walls |
| [storytelling-with-data](./skills/storytelling-with-data/) | *Storytelling with Data* | Cole Nussbaumer Knaflic |
| [system-design-interview](./skills/system-design-interview/) | *System Design Interview* | Alex Xu |
| [using-asyncio-python](./skills/using-asyncio-python/) | *Using Asyncio in Python* | Caleb Hattingh |
| [web-scraping-python](./skills/web-scraping-python/) | *Web Scraping with Python* | Ryan Mitchell |

---

## Discovery

BookLib can find and index skills beyond the bundled set. Configure sources in `booklib.config.json`:

```json
{
  "sources": [
    { "type": "registry", "trusted": true },
    { "type": "manifest", "url": "./community/registry.json", "trusted": true },
    { "type": "github-skills-dir", "repo": "obra/superpowers", "dir": "skills", "branch": "main", "trusted": true },
    { "type": "github-skills-dir", "repo": "ruvnet/ruflo", "dir": ".claude/skills", "branch": "main", "trusted": true },
    { "type": "github-org", "org": "your-org" },
    { "type": "npm-scope", "scope": "@your-scope" }
  ]
}
```

```bash
booklib discover              # list available skills from all sources
booklib discover --refresh    # force re-scan (bypass 24h cache)
booklib fetch naming-cheatsheet    # download and index a specific skill
booklib setup                 # fetch all trusted skills at once
```

Source types: `registry` (bundled), `manifest` (JSON list at URL or local path), `github-skills-dir` (any repo with a `skills/` subdirectory), `github-org`, `npm-scope`.

`"trusted": true` marks a source as auto-installable by `booklib setup`. Untrusted sources are discoverable but require explicit `booklib fetch <name>` with a confirmation prompt.

> Set `GITHUB_TOKEN` to raise the GitHub API limit from 60 to 5000 req/hr:
> `GITHUB_TOKEN=$(gh auth token) booklib discover --refresh`

---

## Orchestrator Compatibility

After `booklib sync`, every fetched skill lives at `~/.claude/skills/<name>/SKILL.md` — the path Claude Code's native Skill tool reads from. No extra configuration needed.

```bash
booklib sync    # write all fetched skills to ~/.claude/skills/
```

| Orchestrator | Install | Skills surface via |
|---|---|---|
| [obra/superpowers](https://github.com/obra/superpowers) | `/plugin install superpowers` | Skill tool — available in every session |
| [ruflo](https://github.com/ruvnet/ruflo) | `npm install -g ruflo` | Skill tool — available in every session |

BookLib uses a `.booklib` marker file to track directories it manages and never overwrites skills you placed there manually.

---

## Swarm & Role-Based Profiles

Equip agents in a swarm with the right skills for their role:

```bash
booklib profile reviewer     # skills for a code reviewer agent
booklib profile security     # skills for a security auditor
booklib profile architect    # skills for a system design agent
```

Roles: `architect` · `coder` · `reviewer` · `tester` · `security` · `frontend` · `optimizer` · `devops` · `ai-engineer` · `manager`

Get a full skill map for a swarm trigger pipeline:

```bash
booklib swarm-config audit      # security → tester agent roles + their skills
booklib swarm-config feature    # architect → coder → reviewer → tester
booklib swarm-config            # list all configured triggers
```

---

## Project Setup

Scaffold context files for every AI tool in the project from a single command:

```bash
booklib init                         # .cursor/rules, CLAUDE.md, copilot-instructions, .gemini/context.md
booklib init --orchestrator=obra     # also shows superpowers install instructions
booklib init --orchestrator=ruflo    # also shows ruflo install instructions
```

Re-run after adding new skills — it updates all files in place.

---

## Agents

| Agent | Model | Skills applied |
|-------|-------|----------------|
| `@booklib-reviewer` | sonnet | Auto-routes to the best skill |
| `@python-reviewer` | sonnet | effective-python · asyncio · web-scraping |
| `@ts-reviewer` | sonnet | effective-typescript · clean-code-reviewer |
| `@jvm-reviewer` | sonnet | effective-java · effective-kotlin · kotlin-in-action · spring-boot |
| `@rust-reviewer` | sonnet | programming-with-rust · rust-in-action |
| `@architecture-reviewer` | opus | domain-driven-design · microservices-patterns · system-design · data-intensive |
| `@data-reviewer` | sonnet | data-intensive-patterns · data-pipelines |
| `@ui-reviewer` | sonnet | refactoring-ui · storytelling-with-data · animation-at-work |

---

## Context Builder

`booklib context` is the most powerful way to use BookLib before starting a task. It searches across all indexed skills simultaneously, extracts the most relevant passage from each matched book, and surfaces every decision it makes — including the quiet ones:

```bash
booklib context "implement a payment service in Kotlin with async error handling"
```

Output:
- For each matched book: **book title + section + specific passage** that applies to your task
- **Auto-resolved decisions** (one book clearly more relevant): shown with prose rationale — non-blocking, you just see why
- **Genuine conflicts** (two books equally applicable): interactive `[a/b]` prompt with passage previews so you can make an informed choice
- A final **sharp system-prompt block** with all resolved knowledge stitched together, every piece cited with its source

```bash
booklib context "design a rate limiter for a distributed API"
booklib context "refactor a God class in Python" --prompt-only   # just the prompt, no report
booklib context "add streaming to a Next.js chat UI" --prompt-only | pbcopy
```

---

## Semantic Search & Audit

```bash
booklib search "how to handle null values in Kotlin"
booklib search "event sourcing vs CQRS" --role=architect   # filter to skills tagged for that role
booklib audit effective-kotlin src/PaymentService.kt        # systematic review of a file
booklib scan    # wisdom heatmap — violations per skill across the whole project
```

---

## Session Handoff

Preserves full context when switching agents or hitting rate limits:

```bash
booklib save-state --goal="..." --next="..." --progress="..."
booklib resume
booklib recover-auto    # auto-recover from last session or git history
```

Multi-agent coordination:

```bash
booklib sessions-list
booklib sessions-merge auth-session,payment-session combined
booklib sessions-lineage main feature-x "branched for auth work"
booklib sessions-compare python-audit,kotlin-audit src/auth.ts comparison
```

All session data lives in `.booklib/` (gitignored). Nothing sent to any server.

---

## MCP Server

```bash
# Claude Code
claude mcp add booklib -- node /path/to/bin/booklib-mcp.js

# Cursor / Windsurf
{ "mcpServers": { "booklib": { "command": "node", "args": ["/path/to/bin/booklib-mcp.js"] } } }
```

MCP tools: `search_skills` · `audit_content` · `save_session_state` · `scan_project`

---

## Quality

Each bundled skill is evaluated by asking a model to review code with and without the skill active. **Delta** = pass rate with skill minus pass rate without — it measures how much the skill actually changes model behaviour. A delta of +0pp means the model already knew it; a high delta means the skill is genuinely teaching it something new.

Thresholds: pass rate ≥ 80% · delta ≥ 20pp · baseline < 70%

<!-- quality-table-start -->
| Skill | Pass Rate | Baseline | Delta | Evals | Last Run |
|-------|-----------|----------|-------|-------|----------|
| animation-at-work | 96% | 64% | +32pp | 3 | 2026-03-28 |
| clean-code-reviewer | 91% | 59% | +33pp | 15 | 2026-03-28 |
| data-intensive-patterns | 91% | 62% | +29pp | 3 | 2026-03-28 |
| data-pipelines | 96% | 30% | +65pp | 3 | 2026-03-28 |
| design-patterns | 100% | 67% | +33pp | 3 | 2026-03-28 |
| domain-driven-design | 100% | 65% | +35pp | 3 | 2026-03-28 |
| effective-java | 92% | 67% | +25pp | 3 | 2026-03-28 |
| effective-kotlin | 100% | 56% | +44pp | 3 | 2026-03-28 |
| effective-python | 91% | 50% | +41pp | 3 | 2026-03-28 |
| effective-typescript | 93% | 27% | +67pp | 3 | 2026-03-28 |
| kotlin-in-action | 95% | 57% | +38pp | 3 | 2026-03-28 |
| lean-startup | 100% | 52% | +48pp | 3 | 2026-03-28 |
| microservices-patterns | 100% | 70% | +30pp | 3 | 2026-03-28 |
| programming-with-rust | 100% | 73% | +27pp | 3 | 2026-03-28 |
| refactoring-ui | 91% | 39% | +52pp | 3 | 2026-03-28 |
| rust-in-action | 94% | 63% | +31pp | 3 | 2026-03-28 |
| skill-router | 94% | 69% | +25pp | 3 | 2026-03-28 |
| spring-boot-in-action | 100% | 65% | +35pp | 3 | 2026-03-28 |
| storytelling-with-data | 100% | 100% | +0pp | 3 | 2026-03-28 |
| system-design-interview | 100% | 52% | +48pp | 3 | 2026-03-28 |
| using-asyncio-python | 91% | 67% | +24pp | 3 | 2026-03-28 |
| web-scraping-python | 96% | 38% | +58pp | 3 | 2026-03-28 |
<!-- quality-table-end -->

Run evals: `ANTHROPIC_API_KEY=... npx @booklib/skills eval <name>`

---

## Repo Structure

```
booklib-ai/skills/
├── skills/                   22 bundled skills (SKILL.md + examples + evals)
├── community/                community skill registry (registry.json)
├── agents/                   8 autonomous reviewer agents
├── commands/                 slash commands, one per skill
├── rules/                    always-on language standards
├── hooks/                    Claude Code PreToolUse hook
├── booklib.config.json       discovery source configuration
└── lib/
    ├── engine/               indexer, searcher, auditor, scanner, handoff, sessions
    ├── skill-fetcher.js      fetch skills from GitHub/npm, sync to ~/.claude/skills/
    ├── discovery-engine.js   scan configured sources for available skills
    ├── project-initializer.js generate context files for all AI tools
    └── ...
bin/
    ├── booklib.js            CLI (registered as `booklib`)
    └── booklib-mcp.js        MCP server
```

> **`.booklib/`** (gitignored) — local state: `sessions/` for handoffs, `index/` for search index, `skills/` for fetched community skills.

---

## Trust & Transparency

- **Book-grounded** — every bundled skill extracts practices from a canonical programming book
- **Evaluated** — quantitative evals: pass rate, delta over no-skill baseline
- **Open discovery** — community registry and source config are public and auditable
- **Local-first** — indexing, search, and session data stays on your machine
- **Marker-based ownership** — `.booklib` marker tracks which `~/.claude/skills/` dirs BookLib manages; never overwrites yours
- **Four runtime deps** — `@xenova/transformers`, `vectra`, `gray-matter`, `@modelcontextprotocol/sdk`

---

## Contributing

To add a bundled skill:

```bash
cp -r skills/clean-code-reviewer skills/your-book-name
# Edit SKILL.md, examples/before.md, examples/after.md, evals/evals.json
npx @booklib/skills check your-book-name
```

To add a community skill, edit `community/registry.json` and open a PR.
To add an external source, edit `booklib.config.json`.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide.

**Open requests:** [The Pragmatic Programmer](https://github.com/booklib-ai/skills/issues/2) · [Clean Architecture](https://github.com/booklib-ai/skills/issues/3) · [A Philosophy of Software Design](https://github.com/booklib-ai/skills/issues/4) · [more →](https://github.com/booklib-ai/skills/issues?q=is%3Aopen+label%3A%22good+first+issue%22)

---

## History

| Milestone | Date |
|-----------|------|
| First commit (`clean-code-reviewer` skill) | Feb 11, 2026 |
| First npm publish (`@booklib/skills` v1.0.0) | Feb 17, 2026 |
| v1.10.0 — 22 skills, 8 agents, profiles, rules | Mar 28, 2026 |
| BookLib Engine — semantic search, session handoff, multi-agent coordination | Mar 29, 2026 |
| Discovery engine — GitHub, npm, community registry, obra/superpowers, ruflo compatibility | Mar 29, 2026 |

Full commit history at [github.com/booklib-ai/skills](https://github.com/booklib-ai/skills).

---

## License

MIT
