# Spec: Unified `booklib install` Command
*Date: 2026-04-01 | Status: Draft*

## Problem
The agent tried `booklib fetch`, `booklib add`, `booklib setup` — all failed. There's no single command that works for all skill sources. Current commands:
- `fetch` — registry only (hardcoded list)
- `add` — URL only (HTTP required)
- `init --skills` — embeds into config files (wrong approach)

The agent spent 5 minutes and 15 attempts trying to install skills.

## Solution
New `booklib install <name>` command that uses the three-tier lookup from Spec D (`installSkill`). Works for bundled, cached, AND community skills. Single command, always works.

## Usage
```bash
booklib install springboot-security
booklib install effective-kotlin clean-code-reviewer   # multiple
booklib install --all                                   # all recommended for project
```

## Implementation
In `bin/booklib.js`, add `case 'install':`:

```js
case 'install': {
  const names = args.slice(1).filter(a => !a.startsWith('--'));
  if (names.length === 0 && !args.includes('--all')) {
    console.error('Usage: booklib install <skill-name> [skill-name...]');
    process.exit(1);
  }
  
  const { installSkill } = await import('../lib/skill-fetcher.js');
  
  for (const name of names) {
    const result = installSkill(name);
    if (result === 'installed') console.log(`  ✓ ${name}`);
    else if (result === 'already-installed') console.log(`  · ${name} (already installed)`);
    else console.log(`  ✗ ${name}: not found`);
  }
  break;
}
```

## Deprecation
`booklib fetch` and `booklib add` print a deprecation notice pointing to `booklib install`:
```
⚠ "booklib fetch" is deprecated. Use: booklib install <name>
```

## Files Changed
- Modify: `bin/booklib.js` — add `case 'install':`, deprecation notices on `fetch` and `add`
- Update help text

## Dependencies
- Spec D (Install Path Fix) — already done, provides `installSkill()`
