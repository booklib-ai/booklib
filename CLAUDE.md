# booklib-ai/skills

22 AI agent skills grounded in canonical programming books. Each skill packages expert practices from a specific book into reusable instructions that Claude and other AI agents can apply to code generation, code review, and design decisions.

## Quick Install

```bash
npx skills add booklib-ai/skills --all -g
```

## Available Skills

| Skill | Book |
|-------|------|
| `animation-at-work` | Animation at Work — Rachel Nabors |
| `clean-code-reviewer` | Clean Code — Robert C. Martin |
| `data-intensive-patterns` | Designing Data-Intensive Applications — Martin Kleppmann |
| `data-pipelines` | Data Pipelines Pocket Reference — James Densmore |
| `design-patterns` | Head First Design Patterns |
| `domain-driven-design` | Domain-Driven Design — Eric Evans |
| `effective-java` | Effective Java — Joshua Bloch |
| `effective-kotlin` | Effective Kotlin — Marcin Moskała |
| `effective-python` | Effective Python — Brett Slatkin |
| `effective-typescript` | Effective TypeScript — Dan Vanderkam |
| `kotlin-in-action` | Kotlin in Action |
| `programming-with-rust` | Programming with Rust — Donis Marshall |
| `rust-in-action` | Rust in Action — Tim McNamara |
| `spring-boot-in-action` | Spring Boot in Action — Craig Walls |
| `lean-startup` | The Lean Startup — Eric Ries |
| `microservices-patterns` | Microservices Patterns — Chris Richardson |
| `refactoring-ui` | Refactoring UI — Adam Wathan & Steve Schoger |
| `skill-router` | Meta-skill — routes to the right skill automatically |
| `storytelling-with-data` | Storytelling with Data — Cole Nussbaumer Knaflic |
| `system-design-interview` | System Design Interview — Alex Xu |
| `using-asyncio-python` | Using Asyncio in Python — Caleb Hattingh |
| `web-scraping-python` | Web Scraping with Python — Ryan Mitchell |

## Project Structure

```
skills/
├── <skill-name>/
│   ├── SKILL.md          # Required — instructions + YAML frontmatter
│   ├── examples/         # before.md and after.md
│   ├── references/       # Deep reference material
│   ├── scripts/          # Executable Python/Bash scripts
│   └── evals/            # evals.json test cases
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to add a new skill. Each skill must pass Bronze quality checks at minimum:

```bash
npx @booklib/skills check <skill-name>
```

All 22 existing skills are at Platinum (13/13 checks).
