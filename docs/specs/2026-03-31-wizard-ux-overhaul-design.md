# Wizard UX Overhaul — Design Spec
*Date: 2026-03-31 | Status: Draft*

## Context

User testing of `booklib init` revealed 6 systemic UX issues:

1. **No progress during index build** — 1-2 min silent operation feels hung
2. **Bad recommendations** — "rust-in-action" #1 for "webshop" because recommender uses 200-char description embeddings, not full content
3. **Copilot not detected** — AgentDetector only checks for `.github/copilot-instructions.md`, not VS Code extensions
4. **Readline race conditions** — sequential `confirm()` + `multiSelect()` silently fail because each creates/destroys a readline interface
5. **Slot system unexplained** — user sees "208/32 slots" with no explanation of what it means or why it's a problem
6. **No ASCII banner** — welcome screen lacks brand identity

## Key Decision: Wizard Flow Reorder

The recommender currently runs BEFORE the index is built, using shallow description-only embeddings from a pre-computed registry cache. This produces poor results.

**New flow:** Build the index first, then use the full-content SRAG-prefixed search engine for recommendations. This gives the same quality as `booklib search` — the recommender IS the search engine.

### New wizard step order

```
1. Banner + intro
2. Project detection ("What are you building?")
3. Health check — diagnose slot problems, promise to fix after indexing
4. AI tool detection (single-step, no two-step confirm+multiSelect)
5. Build index (with per-file progress callback)
6. Recommend skills from index (Option A — use BookLibSearcher.search())
7. Install / cleanup (if over slot limit: offer to keep only relevant skills)
8. Write config files (using selected skills)
9. Summary
```

## 1. Index Build Progress Callback

### Problem
`indexDirectory()` has no callback mechanism. A `for` loop processes 250+ files with zero feedback.

### Design
Add optional `onProgress` callback to `indexDirectory()` options:

```js
async indexDirectory(dirPath, clearFirst, { quiet, onProgress }) {
  // ... existing code ...
  for (const file of files) {
    onProgress?.({ current: fileIndex + 1, total: files.length, file: relativePath });
    // ... process file ...
  }
}
```

The wizard passes a callback that renders an updating counter line:

```
► Building knowledge index...
  [47/249] effective-kotlin...
```

Uses `\r` to overwrite the same line. When done:

```
  ✓ 249 skills indexed (498 chunks)
```

### Files changed
- `lib/engine/indexer.js` — add `onProgress` callback to `indexDirectory()` loop
- `lib/wizard/index.js` — pass callback to `indexDirectory()`

## 2. Recommender: Use Search Index (Option A)

### Problem
Current recommender uses pre-computed embeddings of 200-char skill descriptions. Cosine similarity against these shallow vectors produces nonsensical rankings (Rust #1 for "webshop").

### Design
After the index is built (step 5), the recommender calls `BookLibSearcher.search()` with the user's project description as the query. This uses the full hybrid pipeline (BM25 + SRAG-prefixed vectors + RRF + cross-encoder reranking) — the same quality the user gets from `booklib search`.

```js
async function recommendFromIndex(project) {
  const searcher = new BookLibSearcher();
  const queryText = project.languages.join(' ') + ' best practices';
  const results = await searcher.search(queryText, 20, 0);

  // Aggregate by skill name — multiple chunks may match the same skill
  const bySkill = new Map();
  for (const r of results) {
    const name = r.metadata?.name;
    if (!name) continue;
    if (!bySkill.has(name) || r.score > bySkill.get(name).score) {
      bySkill.set(name, { name, score: r.score, description: r.metadata?.description });
    }
  }

  return [...bySkill.values()].sort((a, b) => b.score - a.score);
}
```

The old `recommend()` function in `skill-recommender.js` is kept as fallback if the index doesn't exist (e.g., first install with no skills yet).

### Files changed
- `lib/wizard/index.js` — new `recommendFromIndex()` function, called after step 5
- `lib/wizard/skill-recommender.js` — unchanged (fallback)

## 3. Copilot / VS Code Extension Detection

### Problem
Copilot is only detected if `.github/copilot-instructions.md` exists. This file is never auto-created — users must create it manually. VS Code with Copilot installed is invisible to the detector.

### Design
Add `EXTENSION_SIGNALS` to `AgentDetector`:

```js
const EXTENSION_SIGNALS = {
  copilot: ['github.copilot', 'github.copilot-chat'],
};
```

Check `~/.vscode/extensions/` for directories starting with those prefixes:

```js
_detectExtensions(home) {
  const extDir = path.join(home, '.vscode', 'extensions');
  if (!fs.existsSync(extDir)) return {};
  let entries;
  try { entries = fs.readdirSync(extDir); } catch { return {}; }
  const found = {};
  for (const [agent, prefixes] of Object.entries(EXTENSION_SIGNALS)) {
    if (prefixes.some(p => entries.some(e => e.startsWith(p)))) {
      found[agent] = true;
    }
  }
  return found;
}
```

Also add `code` to `PATH_SIGNALS` — if VS Code is installed, checking for Copilot extension is meaningful.

### Files changed
- `lib/agent-detector.js` — add `EXTENSION_SIGNALS`, `_detectExtensions()`, call in `detect()`
- `tests/agent-detector.test.js` — add test for extension detection

## 4. Shared Readline Session

### Problem
Each `confirm()` / `multiSelect()` / `readText()` creates and destroys a readline interface. Sequential calls race — the second interface may receive stale stdin state, causing prompts to be silently skipped.

### Design
Replace per-call interfaces with a single session object:

```js
// prompt.js
export function createSession() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  
  function question(prompt) {
    return new Promise(resolve => {
      rl.question(prompt, answer => resolve(answer.trim()));
    });
  }
  
  return {
    async confirm(text, defaultY = true) {
      const answer = await question(`${text} [${defaultY ? 'Y/n' : 'y/N'}] `);
      if (!answer) return defaultY;
      return answer.toLowerCase().startsWith('y');
    },
    async readText(prompt) {
      return question(prompt);
    },
    async multiSelect(title, choices) {
      process.stdout.write(`\n${title}\n\n`);
      choices.forEach((c, i) => {
        const desc = c.description ? `  — ${c.description}` : '';
        process.stdout.write(`  ${i + 1}. ${c.label}${desc}\n`);
      });
      process.stdout.write(`\n  [A] All  [1,2,3...] pick  [S] Skip\n\n  > `);
      const answer = await question('');
      if (!answer) return process.stdin.isTTY ? choices.map((_, i) => i) : [];
      if (answer.toLowerCase() === 'a') return choices.map((_, i) => i);
      if (answer.toLowerCase() === 's') return [];
      return answer.split(',')
        .map(n => parseInt(n.trim(), 10) - 1)
        .filter(n => !isNaN(n) && n >= 0 && n < choices.length);
    },
    close() { rl.close(); },
  };
}
```

The wizard creates one session at start, passes it through all steps, closes at end:

```js
async function runSetup(cwd) {
  const session = createSession();
  try {
    // all steps use session.confirm(), session.readText(), etc.
  } finally {
    session.close();
  }
}
```

Old standalone `confirm()`, `readText()`, `multiSelect()` functions are kept for backwards compatibility (existing callers outside the wizard).

### Files changed
- `lib/wizard/prompt.js` — add `createSession()` export
- `lib/wizard/index.js` — create session, pass to all steps

## 5. Health Check + Slot Explanation

### Problem
User sees "208/32 slots" with no explanation. Doesn't know what slots are, why there's a limit, or what to do about it.

### Design
New step 3 runs after project detection, before anything else. It checks the skill situation and explains problems clearly.

**When over limit (most common case for power users):**
```
► Checking your setup...

  ⚠ You have 208 skills installed in ~/.claude/skills/
  
  Claude loads all skills into its context window at startup.
  With 208, most get truncated — your agent misses key principles.
  Recommended: 10-20 skills matched to your project.

  After indexing, I'll find the best skills for your stack
  and help you clean up the rest.
```

**When at or near limit (25-32):**
```
► Checking your setup...
  You have 28/32 skill slots used. Room for 4 more.
```

**When under limit:**
No message — nothing to explain.

Then at step 7 (after recommendations), if over limit:
```
  You have 208 installed but only need ~10 for this project.
  
  [C] Clean up — keep only the recommended skills (remove 198)
  [K] Keep all + add recommended
  [S] Skip — I'll handle it manually
```

Option C is the opinionated fix. It calls `fetcher.desyncFromClaudeSkills()` for each skill not in the recommended list.

### Files changed
- `lib/wizard/index.js` — new `stepHealthCheck()`, cleanup logic in skill selection step

## 6. ASCII Banner from Logo

### Problem
Welcome screen has no brand identity.

### Design
ASCII art derived from `assets/logo.svg` — open book with spine, page lines, and AI sparkle:

```
      ┌──────┬──────┐ ✦
      │ ───  │ ───  │
      │ ──   │ ──   │  BookLib
      │ ───  │ ───  │
      │ ──   │ ──   │  AI-agent skills from
      │ ───  │ ───  │  expert knowledge
      └──────┴──────┘
```

Printed at wizard start, before any questions. Works in any terminal width (46 chars).

### Files changed
- `lib/wizard/index.js` — replace current banner with ASCII book

---

## Files Changed Summary

| File | Changes |
|------|---------|
| `lib/engine/indexer.js` | `onProgress` callback in `indexDirectory()` |
| `lib/agent-detector.js` | VS Code extension detection for Copilot |
| `lib/wizard/prompt.js` | `createSession()` shared readline |
| `lib/wizard/index.js` | Full wizard rewrite: new flow, health check, index-based recommender, cleanup, banner |
| `tests/agent-detector.test.js` | Extension detection tests |

Does **not** touch: search pipeline, graph, MCP, SKILL.md files, parser, CLI commands.

---

## Out of Scope

- Skill categories / grouped selection UI (future improvement)
- Animated spinner during index build (counter is sufficient)
- Recommender quality beyond Option A (tag-based, full-content cache)
- Interactive scrolling list (requires terminal UI library like `inquirer`)
