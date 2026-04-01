<p align="center">
  <img src="assets/logo.svg" width="80" alt="booklib"/>
</p>

<h1 align="center">@booklib/skills</h1>

<p align="center">
  24 curated knowledge sets from canonical books — structured, tagged, ready for AI agents.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@booklib/skills"><img src="https://img.shields.io/npm/v/@booklib/skills.svg" alt="npm version"/></a>
  <a href="https://www.npmjs.com/package/@booklib/skills"><img src="https://img.shields.io/npm/dw/@booklib/skills.svg" alt="downloads"/></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="license"/></a>
</p>

---

## What's in this package

The raw skill files — 24 structured SKILL.md files covering programming, architecture, design, product, and more. Each skill has XML-tagged sections (`<core_principles>`, `<anti_patterns>`, `<examples>`) and frontmatter metadata.

```
skills/
├── clean-code-reviewer/SKILL.md
├── effective-java/SKILL.md
├── effective-kotlin/SKILL.md
├── domain-driven-design/SKILL.md
├── refactoring-ui/SKILL.md
├── lean-startup/SKILL.md
└── ... 18 more
```

## Want the full platform?

`@booklib/skills` is the content. For search, MCP integration, knowledge graph, and AI tool configuration, install the full platform:

```bash
npm install -g @booklib/core
booklib init
```

**`@booklib/core`** includes everything in this package plus:
- Hybrid search engine (BM25 + vector + cross-encoder reranking)
- MCP server with 8 tools for 10 AI agents
- Personal knowledge graph
- Interactive setup wizard
- Doctor diagnostics

[Learn more →](https://github.com/booklib-ai/booklib)
