# BookLib: Claude Operational Guidelines

You are operating within the BookLib repository, a curated library of software architecture and best-practice distillations. Your goal is to apply these high-level principles to the user's codebase using the built-in search engine.

<workflow>
When a user asks you to write, review, or refactor code, you MUST follow this sequence:

1. **Semantic Search**: Use your terminal to query the BookLib index for relevant architectural wisdom:
   `node bin/booklib.js search "<conceptual query>"`
   *Example: `node bin/booklib.js search "handling nulls in Kotlin"`*

2. **Retrieve Skill**: If the search points to a specific file (e.g., `skills/effective-kotlin/SKILL.md`), use your file-reading tool to read it for detailed principles.

3. **Apply Principles**: Strictly follow the `<core_principles>` and avoid the `<anti_patterns>` found in the search results and skill files.

4. **Cite Your Source**: When outputting code or reviews, you MUST append a brief citation indicating which book or skill guided your decision. 
   *Example: "> Refactored per Effective Kotlin: Item 1 (Limit Mutability)"*

<handoff_protocol>
If you are finishing a planning session and the user wants to switch to a coding agent (or vice-versa), run:
`node bin/booklib.js save-state --goal "<final goal>" --next "<immediate next task>"`
This creates a snapshot that the next agent can resume.
</handoff_protocol>
</workflow>

<navigation_map>
- **Kotlin**: `skills/effective-kotlin/`
- **Java**: `skills/effective-java/`
- **TypeScript**: `skills/effective-typescript/`
- **Python**: `skills/effective-python/`
- **DDD**: `skills/domain-driven-design/`
- **Clean Code**: `skills/clean-code-reviewer/`
- **Architecture**: `skills/data-intensive-patterns/`, `skills/system-design-interview/`
</navigation_map>

<universal_indexer>
Before using the search tool for the first time, ensure the index is built:
`node bin/booklib.js index`
</universal_indexer>

<project_analysis_tools>
Use these tools for systematic codebase analysis:

1. **Project-Wide Scan**: Generate a "Wisdom Heatmap" showing architectural debt per skill:
   `node bin/booklib.js scan`
   This reports: total violations, healthy files %, and top refactoring priorities.

2. **Deep Audit**: Perform a systematic expert review of a specific file against a skill:
   `node bin/booklib.js audit <skill-name> <file-path>`
   *Example: `node bin/booklib.js audit effective-kotlin src/Payment.kt`*
   Use deep audits for high-priority files identified by the scan.

3. **Session Handoff**: When switching to another AI agent or restarting:
   `node bin/booklib.js save-state --goal "<goal>" --next "<immediate task>" --progress "<what's done>"`
   Resume later with: `node bin/booklib.js resume`
   
   **If you forgot to save-state (quota hit suddenly):**
   `node bin/booklib.js recover-auto`
   This recovers context from session files OR git commits (100% recovery):
    - First checks: .booklib/sessions/{branch}.md (explicit session)
    - Then checks: Parent session via lineage (_lineage.json)
    - Then checks: Most recent session on your branch
    - Finally falls back to: Git commit history
   Perfect for long-running sessions where work is already committed.

4. **Auto-Save for Long Sessions**:
   For extended development (2-3+ hours), enable auto-save in your session:
   ```javascript
   const { BookLibHandoff } = await import('./lib/engine/handoff.js');
   const handoff = new BookLibHandoff();
   handoff.setupAutoSave({
     goal: 'Your goal here',
     progress: 'Current progress',
     next: 'Next immediate task',
     skills: ['effective-typescript', 'clean-code-reviewer']
   });
   ```
   This captures context on SIGINT/SIGTERM (process exit) automatically.

5. **Multi-Agent Session Coordination**: Leverage session files from different agents
   
   For **parallel development** (Agent 1 on auth, Agent 2 on payment):
   ```bash
   booklib sessions-list                              # See all agent sessions
   booklib sessions-merge auth-session,payment-session combined-view  # Merge insights
   ```
   
   For **tracking development history**:
   ```bash
   booklib sessions-lineage main feature-x "Agent 2 branched for feature work"
   booklib sessions-lineage                           # Display tree structure
   ```
   
   For **multi-agent code review** (compare audits from different experts):
   ```bash
   booklib sessions-compare python-audit,kotlin-audit src/auth.ts comparison
   ```
   
   This enables:
   - Parallel agents working independently, then merging insights
   - Multiple skill frameworks auditing the same code
   - Session inheritance trees (who branched from whom)
   - Coordinated development across teams
</project_analysis_tools>
