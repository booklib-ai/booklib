# Correction Memory — Design Spec

**Date:** 2026-03-31

---

## Goal

Give agents a way to remember user corrections across sessions. When a user corrects an agent ("don't do that", "always use X not Y"), the correction is stored. As it repeats across sessions it gets promoted — progressively closer to the agent's context — until it is permanently injected into every conversation.

---

## Context

Agents currently have no memory of corrections. The same mistake gets made session after session. The fix has two parts:

1. **Capture**: the agent records a correction the moment it happens via a CLI call.
2. **Promotion**: the correction gains weight with repetition and eventually lives permanently in the agent's always-on context.

BookLib already has the infrastructure: a global corrections store (`~/.booklib/`), a vector index, and a mechanism for writing sections to `~/.claude/CLAUDE.md` (used by the rules system). This feature adds a thin layer on top.

---

## Architecture

```
Capture
  Agent calls: booklib correction add "text"
        │
        ▼
~/.booklib/corrections.jsonl       ← all corrections, mention counts, levels
        │
        ├── Semantic dedup (cosine > 0.85 → increment existing)
        │
        ▼
Level recalculated
        │
        ├── Level 1–2: stored only, not injected
        │
        └── Level 3+: rebuild <!-- booklib-learned --> section in ~/.claude/CLAUDE.md
```

Three files touched total:
- `lib/engine/corrections.js` — new (CorrectionsManager)
- `bin/booklib.js` — extend with `case 'correction':`
- `~/.claude/CLAUDE.md` — a new managed section appended at first promotion

---

## Data Model

### `~/.booklib/corrections.jsonl`

One JSON object per line. Append-only until rewrite on removal.

```json
{
  "id": "c1a2b3",
  "text": "always use short-lived tokens for auth",
  "mentions": 6,
  "level": 3,
  "sessions": ["s1", "s2", "s3", "s4", "s5", "s6"],
  "firstSeen": "2026-03-31T10:00:00Z",
  "lastSeen": "2026-03-31T18:00:00Z"
}
```

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | 6-char hex, generated at creation |
| `text` | string | The correction, as written by the agent |
| `mentions` | number | Total times recorded (across all sessions) |
| `level` | 1–4 | Derived from `mentions` at write time |
| `sessions` | string[] | Session IDs or timestamps that mentioned this correction |
| `firstSeen` | ISO date | When first recorded |
| `lastSeen` | ISO date | Most recent recording |

### Level Table

| Level | Mentions | Behavior |
|-------|----------|----------|
| 1 | 1–2 | Stored in index only. Never injected into context. |
| 2 | 3–4 | Score-boosted in semantic search results. |
| 3 | 5–9 | Written to `<!-- booklib-learned -->` section in `~/.claude/CLAUDE.md`. |
| 4 | 10+ | Same section, flagged as permanent — never auto-removed on decay. |

Thresholds are constants in `corrections.js`, easy to adjust.

---

## `lib/engine/corrections.js` — API

### `addCorrection(text)`

1. Load `~/.booklib/corrections.jsonl`
2. Embed `text` using the existing indexer (`BookLibIndexer.getEmbedding()`)
3. Compare against all existing correction embeddings (cosine similarity)
   - If any existing correction scores `>= 0.85`: increment its `mentions`, update `lastSeen`, recalculate level, save
   - Otherwise: create new entry with `mentions: 1`, `level: 1`
4. If the level changed to 3 or 4: call `rebuildLearnedSection()`
5. Return `{ id, text, mentions, level, wasExisting }`

Embeddings for dedup are computed on the fly (no separate cache needed — the set stays small).

### `listCorrections()`

Returns all entries from `corrections.jsonl`, sorted by `mentions` descending.

### `removeCorrection(id)`

Removes the entry with matching `id` from `corrections.jsonl`. Calls `rebuildLearnedSection()` after removal to keep CLAUDE.md in sync.

### `rebuildLearnedSection()`

Reads all corrections where `level >= 3`. Renders them as a short bullet list. Writes (replaces) the `<!-- booklib-learned-start --> … <!-- booklib-learned-end -->` block in `~/.claude/CLAUDE.md`. Creates the file if absent. The section is rebuilt (not appended) so it never grows stale.

Output format in CLAUDE.md:

```markdown
<!-- booklib-learned-start -->
## Learned Corrections (BookLib)

- Always use short-lived tokens for auth
- Don't auto-format imports in Python
- Use the Payments API v3, not v2

<!-- booklib-learned-end -->
```

Max 20 bullets (level 3+). Each line is the raw `text` field, truncated at 120 chars if needed.

---

## Agent Instruction

When `booklib correction add` is first called (or when the booklib learned section is first written to CLAUDE.md), a one-line instruction is prepended to the learned section:

```markdown
<!-- booklib-learned-start -->
## Learned Corrections (BookLib)

> When the user corrects your approach, run: booklib correction add "brief rule"

- Always use short-lived tokens for auth
...
<!-- booklib-learned-end -->
```

This instruction is always present as long as the section exists. It costs ~20 tokens and ensures every agent knows to call the CLI when corrected — no separate CLAUDE.md edit needed.

---

## CLI Commands

### `booklib correction add <text>`

Records a correction. Called by the agent during a conversation.

```
$ booklib correction add "always use short-lived tokens for auth"
✓ Recorded: "always use short-lived tokens for auth" (mentions: 1, level: 1)

$ booklib correction add "always use short lived tokens"   ← similar text
✓ Updated: "always use short-lived tokens for auth" (mentions: 2, level: 1)
```

If level advances to 3:
```
✓ Updated: "always use short-lived tokens for auth" (mentions: 5, level: 3 ↑)
  → Added to ~/.claude/CLAUDE.md
```

### `booklib correction list`

```
► Learned corrections (3 total)

  ID      Mentions  Level  Text
  c1a2b3  6         3 ●    Always use short-lived tokens for auth
  d4e5f6  4         2      Don't auto-format imports in Python
  a7b8c9  1         1      Use the Payments API v3 not v2

  ● = injected into ~/.claude/CLAUDE.md
```

### `booklib correction remove <id>`

```
$ booklib correction remove c1a2b3
✓ Removed "always use short-lived tokens for auth"
  → ~/.claude/CLAUDE.md updated
```

---

## Deduplication

Semantic similarity is the dedup mechanism. Two corrections are considered the same if their embeddings score `>= 0.85` cosine similarity. This handles natural rephrasing:

- "don't use var in JS" ↔ "always use let/const in JavaScript" → same correction
- "use short-lived tokens" ↔ "tokens should expire quickly" → same correction
- "use short-lived tokens" ↔ "don't auto-format imports" → different corrections

The embedding is computed fresh on each `add` call. With a small set (corrections tend to stay under 50), this is fast enough to be synchronous.

---

## Context Cost

| Scenario | Tokens added per session |
|----------|--------------------------|
| 0 level-3+ corrections | 0 |
| 5 level-3+ corrections | ~150 |
| 10 level-3+ corrections | ~300 |
| 20 level-3+ corrections (max) | ~600 |

Context cost is bounded. Only corrections that have proven themselves (5+ mentions) earn a place in CLAUDE.md.

---

## Error Handling

| Situation | Behavior |
|-----------|----------|
| `~/.booklib/` does not exist | Create on first `add` |
| `~/.claude/CLAUDE.md` not writable | Print error with path, exit 1 |
| `corrections.jsonl` is corrupt | Print warning, treat as empty, do not overwrite |
| Embedding model not loaded | Load on first `add` (same lazy-load as indexer) |
| `id` not found in `remove` | Print "Not found: <id>", exit 1 |

---

## Files

| File | Change |
|------|--------|
| `lib/engine/corrections.js` | Create — CorrectionsManager class |
| `bin/booklib.js` | Add `case 'correction':` dispatcher |
| `~/.claude/CLAUDE.md` | Managed section added at first promotion |
| `~/.booklib/corrections.jsonl` | Created on first `add` |

No changes to the indexer, searcher, session manager, or graph.

---

## Out of Scope (v1)

- Per-project corrections (global only)
- Decay / demotion (corrections never lose mentions once recorded)
- `booklib correction search <query>` — future
- Automatic extraction from conversation transcripts — future
- Exporting corrections to a shareable format — future
