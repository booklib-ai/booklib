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

```bash
npx skills add booklib-ai/skills
```

![Demo](demo.gif)

Each skill is a self-contained folder with a `SKILL.md` file containing instructions and metadata that AI agents use to perform specialized tasks.

## Structure

```
booklib-ai/skills (repo root)
├── skills/
│   ├── clean-code-reviewer/
│   │   ├── SKILL.md          # Required
│   │   ├── examples/
│   │   ├── references/
│   │   ├── scripts/
│   │   └── evals/
│   └── [skill-name]/         # One folder per book
│       └── ...
├── README.md
├── LICENSE
└── package.json
```

## Skill Format

Each skill follows the [Agent Skills standard](https://agentskills.io):

```
skill-name/
├── SKILL.md          # Required — YAML frontmatter + markdown instructions
├── scripts/          # Optional — deterministic code for repeated tasks
├── references/       # Optional — docs loaded into context as needed
├── assets/           # Optional — templates, fonts, images
└── evals/            # Optional — test cases for skill evaluation
```

### SKILL.md Structure

```markdown
---
name: skill-name
description: When to trigger this skill and what it does
---

# Skill Title

Instructions for the AI agent...
```

## Installation

### via skills CLI (recommended)

```bash
# Install all skills globally
npx skills add booklib-ai/skills --all -g

# Install a specific skill
npx skills add booklib-ai/skills --skill effective-kotlin

# List available skills without installing
npx skills add booklib-ai/skills --list
```

### via npm

```bash
# Install all skills globally
npx @booklib/skills add --all --global

# Install a single skill
npx @booklib/skills add effective-kotlin

# List available skills
npx @booklib/skills list
```

Skills are installed to `.claude/skills/` in your project (or `~/.claude/skills/` with `--global`).

### Manual

```bash
git clone https://github.com/booklib-ai/skills.git
cp -r booklib-ai-skills/skills/effective-kotlin /path/to/project/.claude/skills/
```

## Automatic Skill Routing

You don't need to know which skill to apply — the **[skill-router](./skills/skill-router/)** meta-skill does it for you.

When an AI agent receives a task, it can invoke `skill-router` first to identify the 1–2 most relevant skills based on the file, language, domain, and work type. The router then returns a ranked recommendation with rationale, so the right expertise is applied automatically.

```
User: "Review my order processing service"

→ skill-router selects:
   Primary:   domain-driven-design   — domain model design (Aggregates, Value Objects)
   Secondary: microservices-patterns — service boundaries and inter-service communication
   Skip:      clean-code-reviewer    — premature at design stage; apply later on implementation code
```

This means skills compose: `skill-router` acts as an orchestrator that picks the right specialist skills for the context, without requiring the user to know the library upfront.

**See it in action:** The [`benchmark/`](./benchmark/) folder contains a head-to-head comparison — same buggy Node.js file reviewed by the native PR toolkit vs. `skill-router` routing to `clean-code-reviewer` + `design-patterns`. The skill-router pipeline finds ~47% more unique issues and adds a full refactor roadmap with pattern sequence.

## Skills

| Skill | Description |
|-------|-------------|
| 🎬 [animation-at-work](./skills/animation-at-work/) | Apply web animation principles from Rachel Nabors' *Animation at Work* — human perception of motion, 12 principles of animation, and performance |
| 🧹 [clean-code-reviewer](./skills/clean-code-reviewer/) | Reviews code against Robert C. Martin's *Clean Code* principles with heuristic codes (C1–C5, G1–G36, N1–N7, T1–T9) |
| 🗄️ [data-intensive-patterns](./skills/data-intensive-patterns/) | Patterns for reliable, scalable, and maintainable systems from Martin Kleppmann's *Designing Data-Intensive Applications* — storage engines, replication, partitioning, and transactions |
| 🔀 [data-pipelines](./skills/data-pipelines/) | Data pipeline practices from James Densmore's *Data Pipelines Pocket Reference* — ingestion, streaming, transformation, and orchestration |
| 🏗️ [design-patterns](./skills/design-patterns/) | Apply and review GoF design patterns from *Head First Design Patterns* — creational, structural, and behavioral patterns |
| 🧩 [domain-driven-design](./skills/domain-driven-design/) | Design and review software using patterns from Eric Evans' *Domain-Driven Design* — tactical and strategic patterns, and Ubiquitous Language |
| ☕ [effective-java](./skills/effective-java/) | Java best practices from Joshua Bloch's *Effective Java* (3rd Edition) — object creation, generics, enums, lambdas, and concurrency |
| 🛡️ [effective-kotlin](./skills/effective-kotlin/) | Best practices from Marcin Moskała's *Effective Kotlin* (2nd Ed) — safety, readability, reusability, and abstraction |
| 🐍 [effective-python](./skills/effective-python/) | Python best practices from Brett Slatkin's *Effective Python* (2nd Edition) — Pythonic thinking, functions, classes, concurrency, and testing |
| 🔷 [effective-typescript](./skills/effective-typescript/) | TypeScript best practices from Dan Vanderkam's *Effective TypeScript* — type system, type design, avoiding any, type declarations, and migration |
| 🦀 [programming-with-rust](./skills/programming-with-rust/) | Rust practices from Donis Marshall's *Programming with Rust* — ownership, borrowing, lifetimes, error handling, traits, and fearless concurrency |
| ⚙️ [rust-in-action](./skills/rust-in-action/) | Systems programming from Tim McNamara's *Rust in Action* — smart pointers, endianness, memory, file formats, TCP networking, concurrency, and OS fundamentals |
| 🌱 [spring-boot-in-action](./skills/spring-boot-in-action/) | Spring Boot best practices from Craig Walls' *Spring Boot in Action* — auto-configuration, starters, externalized config, profiles, testing with MockMvc, Actuator, and deployment |
| ⚡ [kotlin-in-action](./skills/kotlin-in-action/) | Practices from *Kotlin in Action* (2nd Ed) — functions, classes, lambdas, nullability, and coroutines |
| 🚀 [lean-startup](./skills/lean-startup/) | Practices from Eric Ries' *The Lean Startup* — MVP testing, validated learning, Build-Measure-Learn loop, and pivots |
| 🔧 [microservices-patterns](./skills/microservices-patterns/) | Expert guidance on microservices patterns from Chris Richardson's *Microservices Patterns* — decomposition, sagas, API gateways, event sourcing, CQRS, and service mesh |
| 🎨 [refactoring-ui](./skills/refactoring-ui/) | UI design principles from *Refactoring UI* by Adam Wathan & Steve Schoger — visual hierarchy, layout, typography, and color |
| 🗺️ [skill-router](./skills/skill-router/) | **Meta-skill.** Automatically selects the 1–2 most relevant skills for a given file, PR, or task — routes by language, domain, and work type with conflict resolution. Use this when the right skill isn't obvious, or let the AI invoke it automatically before applying any skill |
| 📊 [storytelling-with-data](./skills/storytelling-with-data/) | Data visualization and storytelling from Cole Nussbaumer Knaflic's *Storytelling with Data* — effective visuals, decluttering, and narrative structure |
| 🏛️ [system-design-interview](./skills/system-design-interview/) | System design principles from Alex Xu's *System Design Interview* — scaling, estimation, and real-world system designs |
| 🔄 [using-asyncio-python](./skills/using-asyncio-python/) | Asyncio practices from Caleb Hattingh's *Using Asyncio in Python* — coroutines, event loop, tasks, and signal handling |
| 🕷️ [web-scraping-python](./skills/web-scraping-python/) | Web scraping practices from Ryan Mitchell's *Web Scraping with Python* — BeautifulSoup, Scrapy, and data storage |

## Contributing a skill

If you've read a book that belongs here, you can add it. The bar is lower than you think:

```bash
# 1. Copy an existing skill as a template
cp -r skills/clean-code-reviewer skills/your-book-name

# 2. Edit SKILL.md, examples/, and evals/

# 3. Validate before opening a PR
npx @booklib/skills check your-book-name
```

The `check` command runs all evals and reports what passes and fails — you get a quality signal before anyone else sees the PR. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide.

**Books with open issues** (tagged `good first issue`): [The Pragmatic Programmer](https://github.com/booklib-ai/skills/issues/2) · [Clean Architecture](https://github.com/booklib-ai/skills/issues/3) · [A Philosophy of Software Design](https://github.com/booklib-ai/skills/issues/4) · [Accelerate](https://github.com/booklib-ai/skills/issues/8) · [and more →](https://github.com/booklib-ai/skills/issues?q=is%3Aopen+label%3A%22good+first+issue%22)

## License

MIT
