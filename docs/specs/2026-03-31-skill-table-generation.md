# Spec: Skill Table Generation from Metadata
*Date: 2026-03-31 | Status: Draft*

## Problem

`ProjectInitializer._extractBlocks()` reads full SKILL.md files and extracts raw XML blocks (hundreds of lines each). This produces the 3000-line config files. Even with the new profile templates, we need a way to generate a concise skills table from metadata only.

## Solution

Replace `_extractBlocks(skillNames)` with `_buildSkillTable(skillNames)` that reads ONLY frontmatter (name, description, tags) from each skill's SKILL.md and produces a markdown table.

## Output Format

```markdown
| Skill | Focus | Tags |
|-------|-------|------|
| effective-kotlin | Kotlin best practices: nulls, scope, mutability | kotlin, jvm |
| springboot-security | authn/authz, CSRF, secrets, rate limiting | java, spring |
| clean-code-reviewer | naming, functions, SRP, error handling | universal |
```

## Skill Lookup Paths

Same three-tier lookup as `installSkill()` (Spec: Install Path Fix):

1. `~/.booklib/skills/<name>/SKILL.md` (project-local skills path)
2. `~/.booklib/cache/skills/<name>/SKILL.md` (cached community skills)
3. `<packageRoot>/skills/<name>/SKILL.md` (bundled)
4. `~/.claude/skills/<name>/SKILL.md` (installed in Claude Code)

Read ONLY frontmatter with `gray-matter`. Extract `name`, `description` (truncated to 60 chars), and `tags` array.

## Implementation

```js
_buildSkillTable(skillNames) {
  const rows = [];
  for (const name of skillNames) {
    const skillPath = this._findSkillFile(name);
    if (!skillPath) continue;
    const { data } = matter(fs.readFileSync(skillPath, 'utf8'));
    const desc = (data.description ?? '').replace(/\n/g, ' ').slice(0, 60);
    const tags = Array.isArray(data.tags) ? data.tags.join(', ') : '';
    rows.push({ name, description: desc, tags });
  }
  
  if (rows.length === 0) return '';
  
  let table = '| Skill | Focus | Tags |\n|-------|-------|------|\n';
  for (const r of rows) {
    table += `| ${r.name} | ${r.description} | ${r.tags} |\n`;
  }
  return table;
}
```

## Files Changed

- Modify: `lib/project-initializer.js` — replace `_extractBlocks()` with `_buildSkillTable()`, add `_findSkillFile()` helper

Does **not** touch: wizard, search, indexer, CLI.

## Dependency

Required by **Spec: Config Profiles** (templates use `{{skills_table}}`).
Can be implemented first as a standalone refactor.
