# BookLib Rules — Design Spec

**Date:** 2026-03-30

---

## Goal

Give users a standalone command to install and inspect the curated rule sets bundled with BookLib. Rules are always-on language standards (as distinct from skills, which are loaded on demand). Currently they are only installable via `booklib init --ecc --rules`, which requires network access and is buried in a larger workflow. `booklib rules` makes rule management a first-class CLI citizen.

---

## Context

BookLib ships a `rules/` directory at package root with language-specific markdown files:

```
rules/
  common/    clean-code.md
  python/    effective-python.md
  kotlin/    effective-kotlin.md
  typescript/ effective-typescript.md
  java/      effective-java.md
  rust/      effective-rust.md
```

These are "always-on" context injections — they remind the AI of language standards on every interaction, unlike skills (which are retrieved on demand). There are two install targets:

- **Project-level**: `.cursor/rules/<lang>-<name>.mdc` — picked up by Cursor, Windsurf, and similar tools
- **Global**: `~/.claude/CLAUDE.md` — appended as a booklib section, applies across all Claude Code projects

---

## Architecture

```
lib/rules/
  rules-manager.js     — listAvailable(), installRule(lang, opts), status(cwd)

bin/booklib.js         — case 'rules': dispatcher

tests/rules/
  rules-manager.test.js
```

`rules-manager.js` reads bundled rules from the local `rules/` directory (resolved relative to `import.meta.url`). It does **not** fetch from GitHub — that path belongs to `project-initializer._pullRules()`. The two are parallel implementations for different sources (local bundle vs. remote repo).

---

## `lib/rules/rules-manager.js` — API

### `listAvailable(cwd?, home?)`

Scans the package-local `rules/` directory. For each language directory, checks whether the corresponding `.mdc` file exists in `<cwd>/.cursor/rules/` (project) and whether a `<!-- booklib-rules-<lang>-start -->` marker exists in `~/.claude/CLAUDE.md` (global). Returns:

```js
[{
  lang: string,              // e.g. 'python'
  files: string[],           // e.g. ['effective-python.md']
  installedProject: boolean, // true if found in .cursor/rules/
  installedGlobal: boolean,  // true if found in ~/.claude/CLAUDE.md
}]
```

### `installRule(lang, opts)`

```js
installRule(lang, {
  cwd = process.cwd(),
  global = false,
  home = os.homedir(),
  dryRun = false,
})
```

1. Reads all `rules/<lang>/*.md` files from the package root
2. **Project install** (`global = false`):
   - Ensures MDC frontmatter exists (adds `---\ndescription: ...\nalwaysApply: false\n---` if absent)
   - Writes to `<cwd>/.cursor/rules/<lang>-<basename>.mdc`
   - Returns list of written paths
3. **Global install** (`global = true`):
   - Renders content as a markdown section
   - Appends/replaces a `<!-- booklib-rules-<lang>-start --> … <!-- booklib-rules-<lang>-end -->` block in `~/.claude/CLAUDE.md`
   - Creates `~/.claude/CLAUDE.md` if absent
   - Returns the path written

Throws if `lang` is not found in `rules/`.

### `status(cwd?)`

Scans `.cursor/rules/` in `cwd` for `.mdc` files. Also checks `~/.claude/CLAUDE.md` for booklib-rules sections. Returns:

```js
{
  cursor: [{ path, sizeBytes }],          // .cursor/rules/*.mdc
  global: [{ lang, sizeBytes }],          // sections in ~/.claude/CLAUDE.md
  totalBytes: number,
}
```

---

## Commands

| Command | Purpose |
|---|---|
| `booklib rules list` | Show available rule sets with install status |
| `booklib rules install <lang>` | Install to current project (`.cursor/rules/`) |
| `booklib rules install <lang> --global` | Append to `~/.claude/CLAUDE.md` |
| `booklib rules status` | Show installed rules + sizes in current project |

---

## Output

### `booklib rules list`

```
► Available rule sets

  Bundled:              project    global
  ✓ python              installed  installed
  ✓ common              installed  —
  · kotlin              —          —
  · typescript          —          —
  · java                —          —
  · rust                —          —

  booklib rules install <lang>           → add to .cursor/rules/
  booklib rules install <lang> --global  → add to ~/.claude/CLAUDE.md
```

### `booklib rules install python`

```
✓ Installed python rules
  .cursor/rules/python-effective-python.mdc  (4.2 KB)
```

### `booklib rules install python --global`

```
✓ Installed python rules globally
  ~/.claude/CLAUDE.md  → added python section (4.2 KB)
```

### `booklib rules status`

```
► Rules status

  .cursor/rules/ (project)
    python-effective-python.mdc   4.2 KB
    common-clean-code.mdc         3.1 KB

  ~/.claude/CLAUDE.md (global)
    python                        4.2 KB

  Total: 11.5 KB across 2 project + 1 global rule(s)
```

### Error: unknown language

```
  Unknown language: 'scala'
  Available: common, python, kotlin, typescript, java, rust
```

---

## MDC Frontmatter

When a rule file lacks frontmatter, `installRule` adds:

```
---
description: <lang> <name> standards (BookLib)
alwaysApply: false
---
```

`alwaysApply: false` is intentional — the user opts in per-project context, not globally via Cursor's always-on mechanism.

---

## Global CLAUDE.md Format

Each language appended to `~/.claude/CLAUDE.md` is wrapped in named markers:

```markdown
<!-- booklib-rules-python-start -->
## Python Standards (BookLib)

<content of effective-python.md>

<!-- booklib-rules-python-end -->
```

Re-running `install python --global` replaces the section (idempotent, not duplicated).

---

## Error Handling

| Situation | Behavior |
|---|---|
| `lang` not found in `rules/` | Print available langs, exit 1 |
| `.cursor/rules/` not writable | Propagate error with path context |
| `~/.claude/CLAUDE.md` not writable | Propagate error with path context |
| `rules/<lang>/` is empty | Print warning, skip silently |

---

## Out of Scope (v1)

- Community rule sets (not bundled) — future
- Per-path scoping in MDC frontmatter (`globs:` field) — future
- Uninstall command — future
- Context size warnings or budget tracking — future
