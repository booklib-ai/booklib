# Contributing

Thanks for wanting to add a skill. A skill packages expert knowledge from a book into reusable instructions that AI agents can apply to real tasks.

## What makes a good skill?

A skill is worth adding when the source book:
- Contains specific, actionable advice (not just general philosophy)
- Covers a topic useful to software engineers or designers
- Has enough depth to fill a meaningful SKILL.md (300+ lines)

## Adding a new skill

### 1. Create the folder

```
skills/skill-name/
├── SKILL.md          # Required
├── examples/
│   ├── before.md     # Code or artifact before applying the skill
│   └── after.md      # The improved version
└── evals/
    └── evals.json    # Test cases
```

The folder name must be lowercase, hyphen-separated, and match the `name` field in `SKILL.md` exactly.

### 2. Write SKILL.md

```markdown
---
name: skill-name
description: >
  What this skill does and when to trigger it. Include specific
  keywords agents should look for. Max 1024 characters.
---

# Skill Title

You are an expert in [domain] grounded in [Book Title] by [Author].

## When to use this skill

[Describe trigger conditions — what user requests or code patterns activate this skill]

## Core principles

[The key ideas from the book, organized for an AI agent to apply]

## How to apply

[Step-by-step process the agent follows]

## Examples

[At least one concrete before/after showing the skill in action]
```

**Requirements:**
- `name`: lowercase letters and hyphens only, matches folder name
- `description`: 1–1024 characters, describes what it does AND when to use it
- Body: clear instructions an AI agent can follow immediately

**Keep SKILL.md under 500 lines.** Move deep reference material to `references/` and link to it.

### 3. Add before/after examples

`examples/before.md` — code or artifact that violates the book's principles.
`examples/after.md` — the same thing improved by applying the skill.

These show how the skill transforms real code.

### 4. Add evals

`evals/evals.json` — array of test cases verifying the skill works:

```json
{
  "evals": [
    {
      "id": "eval-01-short-description",
      "prompt": "The prompt to send to the agent (include code or a scenario)",
      "expectations": [
        "The agent should do X",
        "The agent should flag Y",
        "The agent should NOT do Z"
      ]
    }
  ]
}
```

Aim for 3–5 evals per skill covering:
1. A clear violation of the book's principles
2. A subtle or intermediate case
3. Already-good code (the agent should recognize it and not manufacture issues)

### 5. Run evals and commit results

Run evals manually against your skill to verify it catches what it claims. Commit `evals/results.json` with your findings.

**Quality thresholds** (calibrated to `claude-haiku-4-5` as judge):

| Metric | Minimum | Good | Excellent |
|--------|---------|------|-----------|
| Pass rate (with skill) | ≥ 80% | ≥ 85% | ≥ 90% |
| Delta over baseline | ≥ 20pp | ≥ 25pp | ≥ 30pp |
| Baseline (without skill) | any | < 70% | < 60% |

A high delta matters as much as a high pass rate — it proves the skill is doing real work, not just measuring what Claude already knows. A skill with 90% pass rate and 5pp delta is less valuable than one with 85% and 30pp delta.

The 80% threshold is calibrated to the judge model's own noise floor. Consistently hitting 80%+ with haiku as judge means the skill reliably catches what it claims to catch.

### 6. Submit a PR

```bash
git checkout -b skill/book-name
# add your skill folder
git add skills/skill-name/
git commit -m "feat: add skill-name skill"
gh pr create --title "feat: add skill-name" --body "..."
```

PR checklist:
- [ ] Folder name matches `name` in SKILL.md
- [ ] `description` is under 1024 characters
- [ ] SKILL.md is under 500 lines
- [ ] `examples/before.md` and `examples/after.md` exist
- [ ] `evals/evals.json` has at least 3 test cases
- [ ] `evals/results.json` committed with manual test results
- [ ] Pass rate ≥ 80% and delta ≥ 20pp in results.json

## Adding an MCP Tool

BookLib v3.0.0 delivers knowledge via MCP (5 tools: lookup, review, remember, verify, guard). The old `.claude/agents/` system is deprecated.

To contribute a new MCP tool or modify existing ones, see the developer guide in [AGENTS.md](./AGENTS.md) (coming in 3.0.1).

## Requesting a skill

Open an issue titled **"Skill Request: [Book Name]"** and describe why the book would make a good skill. Community members can then pick it up.

## AI disclosure

If you used an AI tool to help write or review your contribution, disclose it in your PR description. This is required — not optional.

**Acceptable examples:**
- "Written primarily with Claude Code; I reviewed and tested each section manually."
- "I used Copilot for boilerplate; the examples and evals are hand-written."
- "No AI tools used."

**Not acceptable:** submitting AI-generated content without reviewing it yourself. Skills are grounded in specific books — the AI can hallucinate citations, misattribute principles, or invent heuristic codes. You are responsible for accuracy.

Trivial fixes (typos, formatting) don't need a disclosure.

## Questions

Use [GitHub Discussions](../../discussions) for questions, ideas, and feedback.
