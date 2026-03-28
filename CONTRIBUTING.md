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

These power the `npx @booklib/skills demo <name>` command.

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

```bash
ANTHROPIC_API_KEY=your-key npx @booklib/skills eval <name>
```

This runs each eval **with and without** the skill and writes `evals/results.json`. Commit this file — it is how CI and readers verify the skill actually works.

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
- [ ] `evals/results.json` committed (run `npx @booklib/skills eval <name>`)
- [ ] Pass rate ≥ 80% and delta ≥ 20pp in results.json
- [ ] README.md skills table updated

## Adding an Agent

An agent is a multi-step autonomous reviewer that orchestrates one or more skills. If you are packaging a single book's principles, write a skill. If you need to combine multiple skills, detect code patterns to route between them, or run a full review pipeline across a whole codebase, write an agent.

| Write a skill when... | Write an agent when... |
|-----------------------|------------------------|
| You are packaging one book's principles | You need two or more skills applied together |
| The logic is a single lens on code | You need routing logic (detect language → pick skill) |
| Instructions fit in one SKILL.md | You need a multi-step process (diff → detect → review → output) |

### 1. Create the file

Agents live in a flat directory at the repo root:

```
agents/<agent-name>.md
```

The filename must be lowercase and hyphen-separated. It does not need a matching folder — unlike skills, agents have no `examples/` or `evals/` subdirectories.

### 2. Write the frontmatter

Every agent file starts with YAML frontmatter:

```markdown
---
name: agent-name
description: >
  When to invoke this agent and what it does. Include language names,
  domain terms, and trigger conditions. Claude Code uses this field
  for auto-invocation, so make it specific. Max 1024 characters.
tools: ["Read", "Grep", "Glob", "Bash"]
model: sonnet
---
```

**Required fields:**

- `name` — lowercase, hyphens only, matches filename exactly (without `.md`)
- `description` — used by Claude Code to decide when to invoke the agent automatically; include what it does, which skills it applies, and when to use it over alternatives
- `tools` — list of Claude Code tools the agent may call; `["Read", "Grep", "Glob", "Bash"]` covers most reviewers
- `model` — controls cost and capability (see model selection below)

### 3. Write the body

A good agent body has five parts:

**Opening sentence** — one sentence identifying what the agent is, which books it draws from, and its scope.

**Process** — numbered steps the agent follows every time it runs:

1. **Get the scope** — how to determine what to review (e.g., `git diff HEAD`, specific files passed by the user, or a directory scan)
2. **Detect signals** — bash commands or grep patterns that route to the right skill(s)
3. **Apply skill(s)** — one `### Step N` section per skill, each with `HIGH`/`MEDIUM`/`LOW` focus areas
4. **Output** — the standard output format

**Detection table** — a Markdown table mapping code signals to skills:

```markdown
| Code contains | Apply |
|---------------|-------|
| `async def`, `await`, `asyncio` | `using-asyncio-python` |
| `BeautifulSoup`, `scrapy` | `web-scraping-python` |
| General Python | `effective-python` |
```

**Per-skill focus areas** — for each skill applied, list what to look for under `HIGH`, `MEDIUM`, and `LOW` headings. Pull these from the skills' own SKILL.md files, but trim to what is relevant for this agent's scope.

**Output format** — end the body with the standard output block:

```markdown
### Step N — Output format

​```
**Skills applied:** `skill-name(s)`
**Scope:** [files reviewed]

### HIGH
- `file:line` — finding

### MEDIUM
- `file:line` — finding

### LOW
- `file:line` — finding

**Summary:** X HIGH, Y MEDIUM, Z LOW findings.
​```
```

### 4. Choose the right model

| Model | When to use |
|-------|-------------|
| `haiku` | Fast, cheap; use for simple or narrow tasks with a single skill and little routing logic |
| `sonnet` | Default for most reviewers; handles multi-skill routing and structured output well |
| `opus` | Only for architecture or reasoning-heavy agents where depth matters more than cost (e.g., `architecture-reviewer`) |

When in doubt, use `sonnet`.

### 5. Follow naming conventions

| Pattern | Examples | Use for |
|---------|----------|---------|
| `<language>-reviewer` | `python-reviewer`, `jvm-reviewer`, `ts-reviewer` | Language-cluster agents combining all relevant skills for a language |
| `<domain>-reviewer` | `architecture-reviewer`, `data-reviewer`, `ui-reviewer` | Domain-cluster agents cutting across languages |
| Descriptive name | `booklib-reviewer` | Meta or router agents that don't fit a single language or domain |

### 6. Installation

Agents install to `.claude/agents/` alongside skills:

```bash
# Install one agent
npx skills add booklib-ai/skills --agent=python-reviewer

# Install everything (skills + agents)
npx skills add booklib-ai/skills --all
```

Once installed, Claude Code reads the agent's `description` field and auto-invokes it when a matching request arrives — no slash command needed.

### 7. No eval system (yet)

There is no `evals/` system for agents. Instead:

- Make the `description` accurate — it controls when the agent auto-invokes
- Check that every `### Step N` section has a clear, testable action
- Test manually: install the agent locally and run it against a real codebase

### 8. Submit a PR

```bash
git checkout -b agent/agent-name
git add agents/agent-name.md
git commit -m "feat: add agent-name agent"
gh pr create --title "feat: add agent-name agent" --body "..."
```

PR checklist:
- [ ] Filename matches `name` in frontmatter
- [ ] `description` is under 1024 characters and describes when to invoke it
- [ ] `model` is appropriate for the agent's complexity
- [ ] Process steps are numbered and each has a clear action
- [ ] Detection table covers the signals the agent handles
- [ ] Output format section matches the standard `HIGH`/`MEDIUM`/`LOW` format

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
