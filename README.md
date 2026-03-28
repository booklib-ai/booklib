# Skills

<p align="center">
  <img src="assets/logo.svg" width="120" alt="booklib-ai skills logo"/>
</p>

[![npm version](https://img.shields.io/npm/v/@booklib/skills.svg)](https://www.npmjs.com/package/@booklib/skills)
[![npm downloads](https://img.shields.io/npm/dw/@booklib/skills.svg)](https://www.npmjs.com/package/@booklib/skills)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/booklib-ai/skills?style=flat)](https://github.com/booklib-ai/skills/stargazers)
[![Website](https://img.shields.io/badge/website-booklib--ai.github.io%2Fskills-6366f1)](https://booklib-ai.github.io/skills/)

Book-grounded AI agent skills — each skill packages expert practices from a canonical programming book into reusable instructions that Claude and other AI agents can apply to code generation, code review, and design decisions.

![Demo](demo.gif)

## Architecture

The library is organized into three tiers that work together:

| Tier | Count | What it does |
|------|-------|--------------|
| **Skills** | 22 | Passive context loaded from `.claude/skills/` — triggered automatically when the AI detects a matching file or task |
| **Commands** | 22 | Explicit slash commands — `/effective-python`, `/design-patterns`, etc. — one per skill |
| **Agents** | 8 | Autonomous reviewers that combine multiple skills and run end-to-end reviews |

**Profiles** bundle all three tiers by language or domain so you install everything you need in one command.

## Quick Start

```bash
# Pick your language or domain
npx @booklib/skills add --profile=python        # Python skills + commands + python-reviewer agent
npx @booklib/skills add --profile=ts            # TypeScript skills + commands + ts-reviewer agent
npx @booklib/skills add --profile=rust          # Rust skills + commands + rust-reviewer agent
npx @booklib/skills add --profile=jvm           # Java/Kotlin skills + commands + jvm-reviewer agent
npx @booklib/skills add --profile=architecture  # DDD/microservices/system design
npx @booklib/skills add --profile=data          # Data pipelines + DDIA
npx @booklib/skills add --profile=ui            # Refactoring UI + animations + data viz
npx @booklib/skills add --profile=lean          # Lean Startup practices

# Or install everything
npx @booklib/skills add --all
```

Skills are installed to `.claude/skills/` in your project, or `~/.claude/skills/` with `--global`.

## Agents

Eight autonomous reviewers that run end-to-end reviews combining the most relevant skills for each domain:

| Agent | Skills used | Use when |
|-------|-------------|----------|
| `booklib-reviewer` | skill-router (auto-selects) | Unsure which skill applies — routes automatically |
| `python-reviewer` | effective-python · asyncio · web-scraping | Reviewing any Python code |
| `jvm-reviewer` | effective-java · effective-kotlin · kotlin-in-action · spring-boot | Java or Kotlin code reviews |
| `rust-reviewer` | programming-with-rust · rust-in-action | Rust ownership, safety, and systems code |
| `ts-reviewer` | effective-typescript · clean-code-reviewer | TypeScript and TSX reviews |
| `architecture-reviewer` | domain-driven-design · microservices-patterns · system-design · data-intensive | System design, domain models, service boundaries |
| `data-reviewer` | data-intensive-patterns · data-pipelines | Schemas, ETL pipelines, stream processing |
| `ui-reviewer` | refactoring-ui · storytelling-with-data · animation-at-work | UI components, dashboards, data visualizations |

Invoke an agent in Claude Code with `@booklib-reviewer` or the specific agent name.

## Profiles

| Profile | Skills + agents included |
|---------|--------------------------|
| `python` | effective-python · using-asyncio-python · web-scraping-python · python-reviewer |
| `ts` | effective-typescript · clean-code-reviewer · ts-reviewer |
| `jvm` | effective-java · effective-kotlin · kotlin-in-action · spring-boot-in-action · jvm-reviewer |
| `rust` | programming-with-rust · rust-in-action · rust-reviewer |
| `architecture` | domain-driven-design · microservices-patterns · system-design-interview · data-intensive-patterns · architecture-reviewer |
| `data` | data-intensive-patterns · data-pipelines · data-reviewer |
| `ui` | refactoring-ui · storytelling-with-data · animation-at-work · ui-reviewer |
| `lean` | lean-startup · design-patterns · clean-code-reviewer |
| `core` | clean-code-reviewer · design-patterns · skill-router · booklib-reviewer |

## Skills

| Skill | Book |
|-------|------|
| [animation-at-work](./skills/animation-at-work/) | *Animation at Work* — Rachel Nabors |
| [clean-code-reviewer](./skills/clean-code-reviewer/) | *Clean Code* — Robert C. Martin |
| [data-intensive-patterns](./skills/data-intensive-patterns/) | *Designing Data-Intensive Applications* — Martin Kleppmann |
| [data-pipelines](./skills/data-pipelines/) | *Data Pipelines Pocket Reference* — James Densmore |
| [design-patterns](./skills/design-patterns/) | *Head First Design Patterns* |
| [domain-driven-design](./skills/domain-driven-design/) | *Domain-Driven Design* — Eric Evans |
| [effective-java](./skills/effective-java/) | *Effective Java* (3rd ed) — Joshua Bloch |
| [effective-kotlin](./skills/effective-kotlin/) | *Effective Kotlin* (2nd ed) — Marcin Moskała |
| [effective-python](./skills/effective-python/) | *Effective Python* (2nd ed) — Brett Slatkin |
| [effective-typescript](./skills/effective-typescript/) | *Effective TypeScript* — Dan Vanderkam |
| [kotlin-in-action](./skills/kotlin-in-action/) | *Kotlin in Action* (2nd ed) |
| [lean-startup](./skills/lean-startup/) | *The Lean Startup* — Eric Ries |
| [microservices-patterns](./skills/microservices-patterns/) | *Microservices Patterns* — Chris Richardson |
| [programming-with-rust](./skills/programming-with-rust/) | *Programming with Rust* — Donis Marshall |
| [refactoring-ui](./skills/refactoring-ui/) | *Refactoring UI* — Adam Wathan & Steve Schoger |
| [rust-in-action](./skills/rust-in-action/) | *Rust in Action* — Tim McNamara |
| [skill-router](./skills/skill-router/) | Meta-skill — routes to the right skill automatically |
| [spring-boot-in-action](./skills/spring-boot-in-action/) | *Spring Boot in Action* — Craig Walls |
| [storytelling-with-data](./skills/storytelling-with-data/) | *Storytelling with Data* — Cole Nussbaumer Knaflic |
| [system-design-interview](./skills/system-design-interview/) | *System Design Interview* — Alex Xu |
| [using-asyncio-python](./skills/using-asyncio-python/) | *Using Asyncio in Python* — Caleb Hattingh |
| [web-scraping-python](./skills/web-scraping-python/) | *Web Scraping with Python* — Ryan Mitchell |

## Automatic Skill Routing

You don't need to know which skill to apply — the **[skill-router](./skills/skill-router/)** meta-skill does it for you. When invoked, it reads the file, language, domain, and task type, then returns a ranked recommendation with rationale.

```
User: "Review my order processing service"

→ skill-router selects:
   Primary:   domain-driven-design   — domain model design (Aggregates, Value Objects)
   Secondary: microservices-patterns — service boundaries and inter-service communication
```

The `booklib-reviewer` agent wraps this logic end-to-end — invoke it and it handles selection and review automatically.

**Benchmark:** The [`benchmark/`](./benchmark/) folder contains a head-to-head comparison of a native PR review vs. `skill-router` routing to `clean-code-reviewer` + `design-patterns`. The skill-router pipeline finds ~47% more unique issues and produces a full refactor roadmap.

## Quality

Skills are evaluated against 6–15 test cases each, run both **with** and **without** the skill using `claude-haiku-4-5` as model and judge. The delta over baseline is the key signal — it measures how much the skill actually improves Claude's output beyond what it can do unaided.

**Thresholds:** pass rate ≥ 80% · delta ≥ 20pp · baseline < 70%

<!-- quality-table-start -->
| Skill | Pass Rate | Baseline | Delta | Evals | Last Run |
|-------|-----------|----------|-------|-------|----------|
| animation-at-work | — | — | — | — | — |
| clean-code-reviewer | 74% ⚠ | 55% | +19pp | 15 | 2026-03-28 |
| data-intensive-patterns | — | — | — | — | — |
| data-pipelines | — | — | — | — | — |
| design-patterns | — | — | — | — | — |
| domain-driven-design | — | — | — | — | — |
| effective-java | — | — | — | — | — |
| effective-kotlin | — | — | — | — | — |
| effective-python | — | — | — | — | — |
| effective-typescript | — | — | — | — | — |
| kotlin-in-action | — | — | — | — | — |
| lean-startup | — | — | — | — | — |
| microservices-patterns | — | — | — | — | — |
| programming-with-rust | — | — | — | — | — |
| refactoring-ui | — | — | — | — | — |
| rust-in-action | — | — | — | — | — |
| skill-router | — | — | — | — | — |
| spring-boot-in-action | — | — | — | — | — |
| storytelling-with-data | — | — | — | — | — |
| system-design-interview | — | — | — | — | — |
| using-asyncio-python | — | — | — | — | — |
| web-scraping-python | — | — | — | — | — |
<!-- quality-table-end -->

Results are stored in each skill's `evals/results.json` and updated by running `npx @booklib/skills eval <name>`.

## Structure

```
booklib-ai/skills/
├── skills/        22 book-grounded skills (SKILL.md + examples + evals)
├── commands/      22 slash commands, one per skill
├── agents/        8 autonomous reviewer agents
├── hooks/         Claude Code hooks (skill suggestion on UserPromptSubmit)
└── bin/skills.js  CLI
```

Each skill folder follows the [Agent Skills standard](https://agentskills.io):

```
skill-name/
├── SKILL.md          # Required — YAML frontmatter + instructions
├── examples/         # before.md and after.md
├── references/       # Deep reference material loaded on demand
├── scripts/          # Deterministic helper scripts
└── evals/            # Test cases for skill evaluation
```

## Contributing

If you've read a book that belongs here, you can add it:

```bash
# 1. Copy an existing skill as a template
cp -r skills/clean-code-reviewer skills/your-book-name

# 2. Edit SKILL.md, examples/, and evals/

# 3. Validate before opening a PR
npx @booklib/skills check your-book-name
```

The `check` command runs all evals and reports what passes and fails. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide.

**Books with open issues** (tagged `good first issue`): [The Pragmatic Programmer](https://github.com/booklib-ai/skills/issues/2) · [Clean Architecture](https://github.com/booklib-ai/skills/issues/3) · [A Philosophy of Software Design](https://github.com/booklib-ai/skills/issues/4) · [Accelerate](https://github.com/booklib-ai/skills/issues/8) · [and more →](https://github.com/booklib-ai/skills/issues?q=is%3Aopen+label%3A%22good+first+issue%22)

## License

MIT
