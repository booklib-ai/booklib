# Spec: Repo Rename + Version 2.0.0
*Date: 2026-04-01 | Status: Ready*

---

## What's happening

Rename the GitHub repo from `booklib-ai/skills` to `booklib-ai/booklib`. Publish a new npm package `booklib` as the main install. Bump version to 2.0.0 to signal the architectural shift. Keep `@booklib/skills` alive with a redirect notice.

---

## Step 1: Bump version to 2.0.0

Update `package.json` version from `1.18.0` to `2.0.0`.

**Why 2.0:** The architecture changed fundamentally since 1.x — MCP-first integration, hybrid search pipeline, knowledge graph, config assembler, clack wizard. A major version signals this is a new era.

**Files:**
- `package.json` — version: `"2.0.0"`
- `CHANGELOG.md` — add 2.0.0 section summarizing all changes

---

## Step 2: Add `booklib` as alternate package name

Create `packages/booklib/package.json` that re-exports everything from the root:

```json
{
  "name": "booklib",
  "version": "2.0.0",
  "description": "Knowledge bookkeeping for AI agents — expert skills, hybrid search, knowledge graph, MCP tools",
  "bin": {
    "booklib": "../../bin/booklib.js",
    "booklib-mcp": "../../bin/booklib-mcp.js"
  },
  "files": [
    "../../bin/**",
    "../../lib/**",
    "../../skills/**",
    "../../assets/**"
  ],
  "type": "module",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/booklib-ai/booklib.git"
  },
  "homepage": "https://booklib-ai.github.io/booklib/",
  "dependencies": {
    "@booklib/skills": ">=1.18.0"
  }
}
```

Actually — npm workspaces with relative `files` paths pointing up is messy. Simpler approach: publish from the root under both names.

**Simpler plan:** After repo rename, update root `package.json`:
- Change `"name"` from `"@booklib/skills"` to `"booklib"`
- Keep all existing fields
- Update `repository.url` and `homepage` to new URLs

Then create a separate `skills-package.json` for the `@booklib/skills` compatibility package, or just keep publishing `@booklib/skills` from a CI step that overrides the name.

---

## Step 3: Rename GitHub repo

In GitHub repo settings: `booklib-ai/skills` → `booklib-ai/booklib`

**What GitHub handles automatically:**
- All old URLs (`github.com/booklib-ai/skills`) redirect to new URL
- Git remotes using the old URL continue to work (GitHub redirects git operations)
- Stars, issues, PRs, wiki — all preserved

**What needs manual update:**
- Local git remote: `git remote set-url origin git@github.com:booklib-ai/booklib.git`
- GitHub Pages URL changes: `booklib-ai.github.io/skills` → `booklib-ai.github.io/booklib`

---

## Step 4: Update internal references

### Priority 1 — Must update (code references that affect runtime)

| File | What to change |
|------|---------------|
| `package.json` | `name`: `"booklib"`, `repository.url`, `homepage` |
| `lib/project-initializer.js` | 2× `booklib-ai.github.io/skills` → `booklib-ai.github.io/booklib` |
| `lib/well-known-builder.js` | 2× repo URL references |
| `bin/booklib.js` | 4× `booklib-ai/skills` issue URLs |

### Priority 2 — Should update (documentation)

| File | Occurrences |
|------|-------------|
| `README.md` | 9× repo URL + 6× npm package name |
| `README.*.md` (5 translations) | ~20× each |
| `CHANGELOG.md` | 1× repo URL |
| `CONTRIBUTING.md` | 2× repo URL |
| `SECURITY.md` | 1× |
| `docs/index.html` | 6× repo + 4× npm |
| `AGENTS.md` | 18× `@booklib/skills` |
| `agents/*.md` | 1× each (8 files) |

### Priority 3 — Can update later (internal docs)

| File | Occurrences |
|------|-------------|
| `docs/specs/*.md` | Various |
| `docs/plans/*.md` | Various |
| `benchmark/*.md` | Various |
| `research-reports/*.md` | Various |
| `llms-full.txt` | 1× |

### Do NOT change

| File | Why |
|------|-----|
| `bin/skills.cjs` | 17× — this is the legacy compatibility wrapper, may still be referenced by old installs |
| `lib/registry/skills.js` | 10× — internal skill registry, uses `@booklib/skills` as the canonical source name |
| `skills/skill-router/` | Internal skill content referencing itself |

---

## Step 5: Update `@booklib/skills` on npm

Keep publishing `@booklib/skills` but add a deprecation notice:

```json
{
  "name": "@booklib/skills",
  "version": "2.0.0",
  "description": "This package has moved to 'booklib'. Install with: npm install -g booklib",
  "deprecated": "Moved to 'booklib'. Install with: npm install -g booklib"
}
```

Or — keep `@booklib/skills` as a real package containing ONLY the 24 SKILL.md files (for users who just want the content). The main `booklib` package depends on it.

**Decision: keep it real, not deprecated.** Users who only want skill files can install `@booklib/skills`. The main `booklib` package includes everything.

---

## Step 6: Update GitHub Pages

After repo rename, GitHub Pages URL changes from `booklib-ai.github.io/skills` to `booklib-ai.github.io/booklib`.

**Options:**
1. Accept the new URL — update all references
2. Set up a custom domain (e.g., `booklib.dev`) — costs ~$12/year, cleaner URL
3. Add a redirect in the old repo (create a new `booklib-ai/skills` repo with just a redirect page)

**Recommendation:** Accept the new URL for now. Custom domain is a nice-to-have for later.

---

## Step 7: Update local development

```bash
git remote set-url origin git@github.com:booklib-ai/booklib.git
npm link  # re-link with new package name
```

---

## Execution Order

1. Bump version to 2.0.0 + CHANGELOG (commit)
2. Update package.json name + URLs (commit)
3. Update Priority 1 code references (commit)
4. Update Priority 2 documentation (commit)
5. Rename repo on GitHub (web UI)
6. Update local git remote
7. `npm link` to verify
8. Publish `booklib@2.0.0` to npm
9. Publish `@booklib/skills@2.0.0` to npm (skills-only)
10. Update Priority 3 docs (gradual)

---

## Rollback

If anything breaks:
- GitHub repo can be renamed back in settings (instant)
- npm packages can be unpublished within 72 hours
- Old `@booklib/skills` package continues to work regardless
