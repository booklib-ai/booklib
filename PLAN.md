# Implementation Plan

Current version: **1.8.0**
Next release: **1.9.0**

## Remaining features (priority order)

---

### 1. `skills agents` list command
**File:** `bin/skills.js`
**What:** New `agents` command that lists all agents from `agents/` with name + description (parsed from frontmatter). Mirrors `skills list`.
**Usage:**
```bash
skills agents
skills agents --info booklib-reviewer
```

---

### 2. Cursor support (`--target`)
**File:** `bin/skills.js`
**What:** `--target` flag on `add` that writes skills to `.cursor/rules/` (Cursor's rule system). Skills install as rule files; agents not applicable to Cursor (no native agent system).
**Usage:**
```bash
skills add --profile=ts --target cursor      # writes to .cursor/rules/
skills add --profile=ts --target all         # writes to both .claude/ and .cursor/rules/
skills add effective-python --target cursor
```
**Cursor paths:**
- Skills → `.cursor/rules/<skill-name>.md` (copy of SKILL.md)
- Commands → not applicable
- Agents → not applicable

---

### 3. `hooks/` — UserPromptSubmit skill suggestion
**Files:** `hooks/hooks.json`, `hooks/suggest.js`
**What:** A single `UserPromptSubmit` hook. Reads the user's prompt, detects language + "review/check/improve/refactor" intent, outputs a one-line skill suggestion. Only fires when both intent AND a language signal are present — not on every message.

**Hook config:**
```json
{
  "UserPromptSubmit": [{
    "matcher": ".*",
    "hooks": [{ "type": "command", "command": "node ~/.claude/skills/booklib-suggest.js" }]
  }]
}
```

**suggest.js logic:**
- Read prompt from stdin (JSON event from Claude Code)
- Check for review intent: `review|check|improve|refactor|fix|audit`
- Check for language signals: `.py`, `.ts`, `.tsx`, `.java`, `.kt`, `.rs`, etc.
- Output one-line suggestion or nothing

**Install path:** `hooks/suggest.js` in repo → installed to `.claude/` root as `booklib-suggest.js` via `skills add --all` or `skills add --hooks`.

---

### 4. README overhaul
**File:** `README.md`
**What:** Rewrite to document the full three-tier architecture. Current README only describes skills. Needs: profiles section, agents section, commands section, architecture diagram.

**New structure:**
```
1. Tagline + install
2. Three-tier architecture diagram (skills → commands → agents → profiles)
3. Quick start (pick a profile)
4. Skills list (existing)
5. Agents (new section)
6. Profiles (new section)
7. Commands (new section — brief, link to commands/)
8. Quality / evals (existing, improved)
9. Contributing
```

---

## Parallel implementation tracks

| Track | Files touched | Depends on |
|-------|--------------|------------|
| A | `bin/skills.js` | — |
| B | `hooks/hooks.json`, `hooks/suggest.js` | — |
| C | `README.md` | — |

Tracks B and C are independent and can be implemented simultaneously.
Track A (`bin/skills.js`) has no file conflicts with B or C.
All three can be implemented in parallel.

---

## Release checklist

- [ ] Track A: `skills agents` command + Cursor support in bin/skills.js
- [ ] Track B: hooks/hooks.json + hooks/suggest.js
- [ ] Track C: README overhaul
- [ ] Bump version to 1.9.0
- [ ] Commit + tag v1.9.0 + push
