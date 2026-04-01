# BookLib: Claude Operational Guidelines

You are operating within the BookLib repository, a curated library of software architecture and best-practice distillations. Your goal is to apply these high-level principles to the user's codebase using the built-in search engine.

<corrections>
When the user corrects your approach ("don't do that", "always use X", "stop doing Y"), run immediately:
`node bin/booklib.js correction add "brief rule"`
This records the correction. Repeated corrections are promoted automatically into your always-on context.
</corrections>

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

See @.claude/rules/booklib-tools.md for analysis tools (scan, audit, session handoff).


<!-- booklib-standards-start -->
## Stack
javascript (Node.js >= 18, ES modules)

## Commands
- Install: `npm install`
- Build index: `node bin/booklib.js index`
- Scan codebase: `node bin/booklib.js scan`
- Audit file: `node bin/booklib.js audit <skill-name> <file-path>`

## BookLib
BookLib MCP tools are available for code quality guidance.
- Before answering best-practices questions → search_skills
- When reviewing or writing code → search_skills for relevant principles
- When user says "remember/note/capture this" → create_note
- For deep file review against a skill → audit_content
- When code quality issues accumulate → suggest running `booklib doctor`

## Active Skills
| Skill | Focus | Tags |
|-------|-------|------|
| clean-code-reviewer | Reviews code against Robert C. Martin's Clean Code principles | all-languages, quality, naming, refactoring |
| skill-router | Select the 1-2 most relevant booklib for a given file or task | meta, routing, agent-skills |


## References

- [How to customize this file](https://docs.anthropic.com/en/docs/claude-code/claude-md)
- [BookLib documentation](https://booklib-ai.github.io/booklib/)
- [BookLib skills catalog](https://github.com/booklib-ai/booklib)

<!-- booklib-standards-end -->