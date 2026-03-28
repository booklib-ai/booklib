<p align="center">
  <a href="README.md">English</a> · <a href="README.zh-CN.md">中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
  <img src="assets/logo.svg" width="100" alt="booklib-ai skills"/>
</p>

<h1 align="center">booklib-ai/skills</h1>

<p align="center">
  Book-grounded AI agent skills for Claude Code, Cursor, Copilot, and Windsurf.<br/>
  Expert knowledge from canonical programming books — packaged as skills, agents, and rules.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@booklib/skills"><img src="https://img.shields.io/npm/v/@booklib/skills.svg" alt="npm version"/></a>
  <a href="https://www.npmjs.com/package/@booklib/skills"><img src="https://img.shields.io/npm/dw/@booklib/skills.svg" alt="downloads"/></a>
  <a href="https://github.com/booklib-ai/skills/stargazers"><img src="https://img.shields.io/github/stars/booklib-ai/skills?style=flat" alt="stars"/></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="license"/></a>
</p>

<p align="center">
  <b>22 skills</b> &nbsp;·&nbsp; <b>8 agents</b> &nbsp;·&nbsp; <b>6 rules</b> &nbsp;·&nbsp; <b>22 commands</b> &nbsp;·&nbsp; <b>9 profiles</b>
</p>

---

## What it is

Each skill packages the key practices from a specific programming book into structured instructions an AI agent can apply directly to code. Instead of one generic "be a good programmer" prompt, you get targeted expertise grounded in sources like *Effective Java*, *Designing Data-Intensive Applications*, and *Clean Code*.

```bash
# Install everything globally
npx @booklib/skills add --all --global

# Or install just what your stack needs
npx @booklib/skills add --profile=ts --global       # TypeScript
npx @booklib/skills add --profile=python --global   # Python
npx @booklib/skills add --profile=rust --global     # Rust
npx @booklib/skills add --profile=jvm --global      # Java / Kotlin
```

## Four tiers

| Tier | Count | How it activates | Install path |
|------|-------|-----------------|--------------|
| **Skills** | 22 | Automatically, based on file type and task context | `.claude/skills/` |
| **Commands** | 22 | Explicit — `/effective-python`, `/design-patterns`, etc. | `.claude/commands/` |
| **Agents** | 8 | On demand — `@python-reviewer`, `@architecture-reviewer` | `.claude/agents/` |
| **Rules** | 6 | Always — loaded every session, no trigger needed | `.claude/rules/` |

**Profiles** bundle all four tiers by language or domain:

```bash
npx @booklib/skills add --profile=python        # Python skills + commands + agent + rules
npx @booklib/skills add --profile=ts            # TypeScript
npx @booklib/skills add --profile=rust          # Rust
npx @booklib/skills add --profile=jvm           # Java + Kotlin + Spring Boot
npx @booklib/skills add --profile=architecture  # DDD + microservices + system design
npx @booklib/skills add --profile=data          # Data pipelines + DDIA
npx @booklib/skills add --profile=ui            # Refactoring UI + animations + data viz
npx @booklib/skills add --profile=lean          # Lean Startup
npx @booklib/skills add --profile=core          # Skill router + clean code — good default
```

---

## Skills

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

## Agents

Autonomous reviewers that apply multiple skills in a single pass. Invoke with `@agent-name` in Claude Code.

| Agent | Model | Skills applied |
|-------|-------|----------------|
| `@booklib-reviewer` | sonnet | Auto-routes to the best skill — use this when unsure |
| `@python-reviewer` | sonnet | effective-python · asyncio · web-scraping |
| `@ts-reviewer` | sonnet | effective-typescript · clean-code-reviewer |
| `@jvm-reviewer` | sonnet | effective-java · effective-kotlin · kotlin-in-action · spring-boot |
| `@rust-reviewer` | sonnet | programming-with-rust · rust-in-action |
| `@architecture-reviewer` | opus | domain-driven-design · microservices-patterns · system-design · data-intensive |
| `@data-reviewer` | sonnet | data-intensive-patterns · data-pipelines |
| `@ui-reviewer` | sonnet | refactoring-ui · storytelling-with-data · animation-at-work |

---

## Rules

Always-on coding standards — installed to `.claude/rules/` and loaded every session without any trigger conditions.

| Rule | Language | Source |
|------|----------|--------|
| `clean-code` | all | *Clean Code* — naming, functions, comments, structure |
| `effective-python` | Python | *Effective Python* — Pythonic style, types, error handling |
| `effective-typescript` | TypeScript | *Effective TypeScript* — types, inference, null safety |
| `effective-java` | Java | *Effective Java* — creation, classes, generics, concurrency |
| `effective-kotlin` | Kotlin | *Effective Kotlin* — safety, coroutines, collections |
| `rust` | Rust | *Programming with Rust* + *Rust in Action* — ownership, errors, idioms |

```bash
npx @booklib/skills add --rules             # install all rules
npx @booklib/skills add --rules=python      # install one language
npx @booklib/skills add --hooks             # install the skill suggestion hook
```

---

## Skill routing

Not sure which skill to use? The `skill-router` meta-skill selects the best match automatically, and the `@booklib-reviewer` agent wraps it end-to-end:

```
User: "Review my order processing service"

→ skill-router selects:
   Primary:   domain-driven-design   — domain model design (Aggregates, Value Objects)
   Secondary: microservices-patterns — service boundaries and inter-service communication
```

**Benchmark:** [`benchmark/`](./benchmark/) shows a head-to-head comparison of a standard PR review vs. skill-router routing to two skills. The skill-router pipeline found ~47% more unique issues.

---

## Quality

Skills are evaluated with and without the skill active, using `claude-haiku-4-5` as model and judge. The delta over baseline is the key signal.

**Thresholds:** pass rate ≥ 80% · delta ≥ 20pp · baseline < 70%

<!-- quality-table-start -->
| Skill | Pass Rate | Baseline | Delta | Evals | Last Run |
|-------|-----------|----------|-------|-------|----------|
| animation-at-work | — | — | — | — | — |
| clean-code-reviewer | 82% ⚠ | 55% | +26pp | 15 | 2026-03-28 |
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

Run evals: `ANTHROPIC_API_KEY=... npx @booklib/skills eval <name>`

---

## Repo structure

```
booklib-ai/skills/
├── skills/      22 book-grounded skills (SKILL.md + examples + evals)
├── agents/      8 autonomous reviewer agents
├── commands/    22 slash commands, one per skill
├── rules/       6 always-on language standards
├── hooks/       Claude Code UserPromptSubmit hook
└── bin/         CLI (skills.js)
```

---

## Contributing

If you've read a book that belongs here, open a PR:

```bash
# 1. Scaffold a new skill
cp -r skills/clean-code-reviewer skills/your-book-name

# 2. Edit SKILL.md, examples/before.md, examples/after.md, evals/evals.json

# 3. Validate
npx @booklib/skills check your-book-name
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide including how to add agents.

**Open requests** (tagged `good first issue`): [The Pragmatic Programmer](https://github.com/booklib-ai/skills/issues/2) · [Clean Architecture](https://github.com/booklib-ai/skills/issues/3) · [A Philosophy of Software Design](https://github.com/booklib-ai/skills/issues/4) · [Accelerate](https://github.com/booklib-ai/skills/issues/8) · [more →](https://github.com/booklib-ai/skills/issues?q=is%3Aopen+label%3A%22good+first+issue%22)

---

## License

MIT
