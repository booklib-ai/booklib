# Spec: Dream Service — Autonomous Knowledge Consolidation
*Date: 2026-04-02 | Status: Vision*

## Tagline

BookLib learns while you work. Consolidates while you rest.

---

## Concept

A background service (daemon) that continuously analyzes and improves BookLib's knowledge graph. Like human memory consolidation during sleep — experiences are captured during the day, organized and strengthened at night.

---

## Two Zones — Different Rules

### Zone 1: Project Graph (shared knowledge)

**What it contains:** Team decisions, architecture rules, expert principles, captured notes that affect the project.

**Who relies on it:** Everyone on the project.

**Daemon behavior: SUGGEST ONLY — never modify directly.**

The daemon produces a **knowledge report** — like a PR for your knowledge graph. It shows what it found and what it recommends, but the user approves changes.

```
booklib dream --report

  ┌─────────────────────────────────────┐
  │  BookLib Dream Report               │
  │  Last run: 2026-04-02 02:00         │
  └─────────────────────────────────────┘

  Duplicates (3):
    • "JWT refresh token strategy" ≈ "JWT token rotation"
      → Suggest: merge into one node, keep both edges
    
    • "Order data model v1" ≈ "Order schema notes"
      → Suggest: merge, link to order-service component

  Contradictions (1):
    • "Use event sourcing for orders" ↔ "Orders use simple CRUD"
      → Suggest: add 'contradicts' edge, flag for team review

  Orphans (5):
    • "CSS grid tips" — no edges, no component, captured 14 days ago
      → Suggest: link to frontend component or archive

  Weak links (2):
    • "Auth patterns" → "user-service" has 'see-also' but content suggests 'applies-to'
      → Suggest: upgrade edge type

  Apply suggestions? [A] All  [1,2,3...] Pick  [S] Skip
```

### Zone 2: Personal Graph (per-user knowledge)

**What it contains:** My working patterns, session observations, personal preferences, frequently searched topics.

**Who relies on it:** Only me.

**Daemon behavior: AUTONOMOUS — modifies freely.**

No approval needed. The daemon:
- Merges my duplicate observations
- Summarizes my session patterns ("you focus on auth every Monday")
- Pre-computes my likely next queries based on history
- Prunes observations older than 30 days with no reinforcement
- Builds a "morning briefing" for my next session

---

## Personal Graph — New Concept

BookLib currently has no personal layer. Everything is project-scoped. The dream service introduces a per-user knowledge space:

```
~/.booklib/
├── knowledge/           ← project graph (shared, existing)
│   ├── nodes/
│   └── graph.jsonl
├── personal/            ← personal graph (new, per-user)
│   ├── observations/    ← what I did, what I searched, what I corrected
│   ├── patterns/        ← consolidated from observations (daemon-generated)
│   ├── preferences/     ← working style, tool preferences
│   └── briefings/       ← morning briefings (daemon-generated)
└── dream/               ← daemon state
    ├── last-run.json
    ├── project-report.md ← latest suggestions for project graph
    └── dream-log.jsonl   ← history of what the daemon did
```

### What feeds the personal graph

- **Search queries** — what you look up via `lookup` MCP tool
- **Corrections** — what you correct the agent on (already tracked)
- **Session patterns** — what files you edit, what topics you focus on
- **Time patterns** — when you work, what you do at different times
- **Agent interactions** — via usage tracking hook (already exists)

### What the daemon does with personal data

**Observation → Pattern → Preference cycle:**

```
Day 1: searched "error handling" before reviewing code
Day 2: searched "error handling" before reviewing code
Day 3: searched "error handling" before reviewing code
    ↓ daemon consolidates ↓
Pattern: "user always checks error handling before code review"
    ↓ daemon promotes ↓
Preference: "pre-fetch error handling context when code review starts"
    ↓ daemon generates ↓
Morning briefing: "Today's review focus: error handling patterns are pre-loaded"
```

---

## Architecture

### The daemon

A background process that wakes up periodically (configurable — default: every 6 hours, or on-demand via `booklib dream`).

**Implementation options:**

| Platform | Mechanism |
|----------|-----------|
| macOS | LaunchAgent (`~/Library/LaunchAgents/ai.booklib.dream.plist`) |
| Linux | systemd user service (`~/.config/systemd/user/booklib-dream.service`) |
| Windows | Task Scheduler |
| Cross-platform | Node.js process spawned by `booklib dream --daemon` |
| Manual | `booklib dream` command (no daemon, user triggers) |

`booklib init` offers to install the daemon:

```
► Set up background knowledge optimization?

  BookLib can analyze your knowledge graph periodically and
  suggest improvements. Personal observations are consolidated
  automatically. Project knowledge changes require your approval.

  1. Yes — run every 6 hours (recommended)
  2. Yes — run nightly only
  3. No — I'll run 'booklib dream' manually

  > 1
```

### Processing modes for dream

Same three modes as search:

| Mode | Project graph analysis | Personal graph consolidation |
|------|----------------------|------------------------------|
| **Fast** | Rule-based: exact title match for duplicates, zero-edge orphan detection, date-based staleness | Rule-based: frequency counting for patterns, simple merge for duplicate observations |
| **Local** | Small model compares node pairs for similarity/contradiction | Small model summarizes observation clusters into patterns |
| **API** | LLM reads full graph, produces comprehensive analysis report | LLM generates intelligent briefings and preference insights |

### MCP tool

New MCP tool: `dream` (or `optimize`)

```
dream: "Use at the end of a long session or when the user says 'clean up my knowledge' 
or 'what have I learned lately'. Analyzes the knowledge graph and returns a consolidation 
report for project knowledge + auto-optimizes personal observations."
```

### Morning briefing

When the agent starts a new session, it can call `brief` which now includes a personal briefing section:

```json
{
  "briefing": {
    "expert_knowledge": [...],
    "project_knowledge": [...],
    "personal": {
      "patterns": ["You usually check auth patterns before reviewing code"],
      "pre_fetched": ["Error handling principles loaded based on your history"],
      "suggestions": ["3 project knowledge improvements waiting for review"]
    }
  }
}
```

---

## What this enables

**For the user:**
- Knowledge that gets better over time without effort
- Personal AI that learns your working patterns
- Morning briefings that tell you what's relevant today
- Project knowledge that stays clean and consistent

**For positioning:**
- "BookLib learns while you work. Consolidates while you rest."
- No other tool does this — Mem0, Cognee, Letta are all passive stores
- KAIROS does this but it's Anthropic-internal and Claude-only
- BookLib would be the first OPEN SOURCE tool with autonomous knowledge consolidation

---

## Implementation order

1. **`booklib dream` command** — manual trigger, fast mode only. Produces project report + basic personal consolidation.
2. **Personal graph storage** — new `~/.booklib/personal/` directory, observation capture from usage tracking.
3. **Dream daemon** — background service with platform-specific installers.
4. **Morning briefing** — integrate personal patterns into `brief` MCP tool response.
5. **Processing modes** — add local model and API modes for smarter consolidation.

---

## Open questions

- How much disk space will personal observations consume over months?
- Should personal data be encrypted at rest? (It contains working patterns)
- How to handle multi-machine sync? (Laptop at work, desktop at home)
- Should the project report be a PR/commit on the graph, or just a CLI report?
- How to prevent the daemon from using too much CPU/battery?
