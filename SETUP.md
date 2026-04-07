# BookLib: Post-Setup

**What it does:** Local knowledge platform. 25 skills + hybrid search (BM25 + semantic + graph). Zero cloud.

**How it integrates:**
- Claude Code: `search_skills`, `audit_content`, `create_note` (MCP)
- Copilot/Gemini: CLI via `node bin/booklib.js`
- Auto-loaded in `.claude/CLAUDE.md`

**Commands:**
- `node bin/booklib.js index` — build search index (run once)
- `node bin/booklib.js search "<query>"` — find principles
- `node bin/booklib.js audit <skill> <file>` — deep review
- `node bin/booklib.js scan` — codebase health check
- `node bin/booklib.js doctor` — diagnostics
- `node bin/booklib.js analyze` — gaps by skill
- `node bin/booklib.js connect` — link concepts
- `init --reset` — wipe & restart

**One flow:** Search → read skill → apply principles → cite source.

**Keys:** Stack = Node.js 18+ ES modules. Index lives in `.booklib/`. Skills in `skills/`.
