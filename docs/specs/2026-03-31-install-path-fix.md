# Spec: Fix Install Path for Non-Bundled Skills
*Date: 2026-03-31 | Status: Draft*

## Problem

The wizard search recommends skills from the index (which includes community skills from `~/.claude/skills/`). When the user selects them, `installBundledSkill()` fails with "Bundled skill not found" because it only looks in the package's `skills/` directory.

In the last test run, ALL 10 selected skills failed to install:
```
✗ springboot-security: Bundled skill not found: springboot-security
✗ frontend-patterns: Bundled skill not found: frontend-patterns
...
```

## Root Cause

`installBundledSkill(name)` checks `<packageRoot>/skills/<name>/SKILL.md`. Community skills live in `~/.claude/skills/<name>/SKILL.md` — a different location. The wizard's install loop assumes all recommendations are bundled.

## Solution

The wizard install step needs a three-tier lookup:

1. **Already installed?** — if skill exists in `~/.claude/skills/<name>/` with a `.booklib` marker, skip (already there).
2. **Bundled?** — if skill exists in `<packageRoot>/skills/<name>/SKILL.md`, call `installBundledSkill()`.
3. **In cache?** — if skill exists in `~/.booklib/cache/skills/<name>/SKILL.md`, copy to `~/.claude/skills/`.
4. **None of the above** — report "skill available via search index but not installable" (edge case).

## Implementation

New exported function in `lib/skill-fetcher.js`:

```js
export function installSkill(skillName) {
  const claudeDir = path.join(os.homedir(), '.claude', 'skills', skillName);
  
  // Already installed
  if (fs.existsSync(path.join(claudeDir, '.booklib'))) return 'already-installed';
  
  // Try bundled
  const bundledPath = path.join(PACKAGE_ROOT, 'skills', skillName, 'SKILL.md');
  if (fs.existsSync(bundledPath)) {
    installBundledSkill(skillName);
    return 'installed';
  }
  
  // Try cache
  const { cachePath } = resolveBookLibPaths();
  const cachedPath = path.join(cachePath, 'skills', skillName, 'SKILL.md');
  if (fs.existsSync(cachedPath)) {
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.copyFileSync(cachedPath, path.join(claudeDir, 'SKILL.md'));
    fs.writeFileSync(path.join(claudeDir, '.booklib'), '');
    return 'installed';
  }
  
  return 'not-found';
}
```

The wizard replaces:
```js
installBundledSkill(skill.name);
```
with:
```js
const result = installSkill(skill.name);
```

## Files Changed

- Modify: `lib/skill-fetcher.js` — add `installSkill()` function
- Modify: `lib/wizard/index.js` — use `installSkill()` instead of `installBundledSkill()`
- Create: `tests/skill-fetcher-install.test.js` — test three-tier lookup

Does **not** touch: search pipeline, indexer, config files, doctor.

## No Dependencies

Can be implemented independently of all other specs.
