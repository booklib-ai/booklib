# Agent Integration

How to install and use `booklib` with different AI coding assistants.

## What gets installed

Each install creates up to three things in your project (or globally with `--global`):

| Directory | Contents | Purpose |
|-----------|----------|---------|
| `.claude/skills/` | 22 book-grounded skills | Auto-triggered by context |
| `.claude/commands/` | 22 slash commands | Explicit invocation (`/effective-python`) |
| `.claude/agents/` | 8 reviewer agents | Autonomous end-to-end reviews |

The fastest way to install is by **profile** — one command installs the right skills, commands, and agent for your language or domain:

```bash
npx booklib add --profile=python        # Python
npx booklib add --profile=ts            # TypeScript / JavaScript
npx booklib add --profile=jvm           # Java + Kotlin + Spring Boot
npx booklib add --profile=rust          # Rust
npx booklib add --profile=architecture  # DDD, microservices, system design
npx booklib add --profile=data          # Pipelines, ETL, storage
npx booklib add --profile=ui            # UI design, charts, animations
npx booklib add --profile=lean          # Lean Startup practices
npx booklib add --profile=core          # Routing + general quality (good default)

# Or install everything
npx booklib add --all
```

Add `--global` to any command to install to `~/.claude/` instead of the project directory.

---

## Claude Code

### Install

```bash
# Recommended — install by profile
npx booklib add --profile=ts --global

# Everything
npx booklib add --all --global

# Single skill
npx booklib add effective-typescript
```

### How skills trigger

Claude Code reads skills from `.claude/skills/` (project) or `~/.claude/skills/` (global) and loads them based on the `description` field in each `SKILL.md`. Skills activate automatically when the context matches.

### Slash commands

Each profile also installs companion slash commands:

```
/effective-typescript     # runs the effective-typescript skill explicitly
/clean-code-reviewer      # reviews against Clean Code principles
/skill-router             # routes automatically to the best skill
```

### Agents

Agents are autonomous reviewers installed to `.claude/agents/`. Invoke with `@`:

```
@booklib-reviewer         # auto-routes to the right skill
@python-reviewer          # Python: effective-python + asyncio + scraping
@ts-reviewer              # TypeScript: effective-typescript + clean-code
@jvm-reviewer             # Java/Kotlin: effective-java + kotlin + spring-boot
@rust-reviewer            # Rust: programming-with-rust + rust-in-action
@architecture-reviewer    # DDD + microservices + system-design + DDIA
@data-reviewer            # data-intensive-patterns + data-pipelines
@ui-reviewer              # refactoring-ui + storytelling + animation
```

### Skill suggestion hook

`add --all` also installs a `UserPromptSubmit` hook (`booklib-suggest.js`) that detects when you're asking to review code and suggests the relevant skill — without firing on every message.

To activate it, add the hook config to your Claude Code settings:
```json
{
  "UserPromptSubmit": [{
    "hooks": [{ "type": "command", "command": "node \"$HOME/.claude/booklib-suggest.js\"" }]
  }]
}
```

---

## Cursor

Cursor reads rules from `.cursor/rules/`. Use `--target=cursor` to install there:

```bash
# Install to Cursor only
npx booklib add --profile=ts --target=cursor

# Install to both Claude Code and Cursor
npx booklib add --profile=ts --target=all

# Single skill to Cursor
npx booklib add effective-typescript --target=cursor
```

Skills are written as `.cursor/rules/<skill-name>.md`. Cursor loads them in Agent mode. Agents are not applicable to Cursor (no native agent system).

---

## GitHub Copilot (VS Code)

Copilot Chat doesn't load `.claude/skills/` natively. Reference skills explicitly in chat:

```
Using the effective-typescript skill, review this file for type safety issues.
Apply the clean-code-reviewer skill to the current diff.
```

Or install globally and reference by name — some Copilot extensions pick up `.claude/skills/` as context.

---

## Windsurf

Install into your project:

```bash
npx booklib add --profile=ts
```

Skills go to `.claude/skills/`. In Windsurf's Cascade mode, reference a skill by name or use `@booklib-reviewer` if agents are supported. The `skill-router` skill selects the right skill automatically when you describe your task.

---

## Supported platforms

| Platform | Skills | Commands | Agents | Auto-trigger |
|----------|--------|----------|--------|--------------|
| Claude Code | `.claude/skills/` | `.claude/commands/` | `.claude/agents/` | Yes |
| Cursor | `.cursor/rules/` (`--target=cursor`) | — | — | Partial |
| GitHub Copilot | Manual reference | — | — | No |
| Windsurf | `.claude/skills/` | — | Partial | Partial |

---

## Manual installation

```bash
# Single skill to any path
cp -r skills/effective-kotlin /path/to/.claude/skills/

# All skills
cp -r skills/* /path/to/.claude/skills/
```

Any agent that reads `.claude/skills/` picks them up automatically.

---

## Requesting support for a new platform

Open an issue titled **"Platform Support: [Name]"** and describe how the platform loads context files. We'll add installation instructions here.
