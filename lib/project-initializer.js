import fs from 'fs';
import os from 'os';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import { parseSkillFile } from './engine/parser.js';
import { BookLibScanner } from './engine/scanner.js';
import { resolveBookLibPaths } from './paths.js';
import { loadConfig } from './config-loader.js';
import { AgentDetector } from './agent-detector.js';

const PACKAGE_ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');

const TOOL_FILE_MAP = {
  claude:     { filePath: 'CLAUDE.md',                          fileHeader: '' },
  cursor:     { filePath: '.cursor/rules/booklib-standards.mdc', fileHeader: null },
  copilot:    { filePath: '.github/copilot-instructions.md',    fileHeader: '# Copilot Instructions\n\n' },
  gemini:     { filePath: '.gemini/context.md',                 fileHeader: '# Project Context\n\n' },
  codex:      { filePath: 'AGENTS.md',                          fileHeader: '# Agent Instructions\n\n' },
  windsurf:   { filePath: '.windsurfrules',                     fileHeader: '' },
  'roo-code': { filePath: '.roo/rules/booklib-standards.md',    fileHeader: null },
  openhands:  { filePath: '.openhands/instructions.md',         fileHeader: '# OpenHands Instructions\n\n' },
  junie:      { filePath: '.junie/guidelines.md',               fileHeader: '# Junie Guidelines\n\n' },
  goose:      { filePath: '.goose/context.md',                  fileHeader: '# Goose Context\n\n' },
  opencode:   { filePath: '.opencode/instructions.md',          fileHeader: '# OpenCode Instructions\n\n' },
  letta:      { filePath: '.letta/skills/booklib.md',           fileHeader: null },
};

const TOOL_DOCS = {
  claude:     'https://docs.anthropic.com/en/docs/claude-code/claude-md',
  cursor:     'https://docs.cursor.com/context/rules-for-ai',
  copilot:    'https://docs.github.com/en/copilot/customizing-copilot/adding-repository-custom-instructions',
  gemini:     'https://github.com/google-gemini/gemini-cli#configuration',
  codex:      'https://github.com/openai/codex#agents-md',
  windsurf:   'https://docs.windsurf.com/windsurf/customize',
  'roo-code': 'https://docs.roocode.com/features/custom-rules',
  openhands:  'https://docs.all-hands.dev/usage/configuration',
  junie:      'https://www.jetbrains.com/help/junie/guidelines',
  goose:      'https://block.github.io/goose/docs/configuration',
  opencode:   'https://github.com/opencode-ai/opencode#configuration',
  letta:      'https://docs.letta.com/agents/custom-instructions',
};

/**
 * Generates tool-specific context files from BookLib skills.
 *
 * Supported targets:
 *   cursor   → .cursor/rules/booklib-standards.mdc
 *   claude   → CLAUDE.md  (appends a standards section)
 *   copilot  → .github/copilot-instructions.md
 *   gemini   → .gemini/context.md
 *   all      → all of the above
 */

const BOOKLIB_LINE = 'BookLib: knowledge tools for this project. Read skills/booklib-mcp-guide/SKILL.md before first use.';
const AGENT_MARKER_START = '<!-- booklib-standards-start -->';
const AGENT_MARKER_RE = /<!-- booklib-standards-start -->[\s\S]*?<!-- booklib-standards-end -->\n*/;

const AGENT_SKELETON = `# Project

## Stack
<!-- describe your tech stack -->

## Commands
<!-- build, test, lint commands -->

## Conventions
<!-- coding standards, naming, patterns -->

## Architecture
<!-- key decisions and rationale -->

`;

export function writeAgentLine(filePath, opts = {}) {
  const { skeleton = false } = opts;

  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const content = skeleton ? AGENT_SKELETON + BOOKLIB_LINE + '\n' : BOOKLIB_LINE + '\n';
    fs.writeFileSync(filePath, content);
    return 'created';
  }

  let content = fs.readFileSync(filePath, 'utf8');

  // Already has the line — skip
  if (content.includes('booklib-mcp-guide')) return 'skipped';

  // Clean up old markers
  if (content.includes(AGENT_MARKER_START)) {
    content = content.replace(AGENT_MARKER_RE, '');
  }

  // Append the line
  content = content.trimEnd() + '\n\n' + BOOKLIB_LINE + '\n';
  fs.writeFileSync(filePath, content);
  return 'updated';
}

export class ProjectInitializer {
  constructor(options = {}) {
    this.paths = resolveBookLibPaths(options.projectCwd);
    this.projectCwd = options.projectCwd ?? process.cwd();
    this.config = loadConfig(options.projectCwd);
    this.scanner = new BookLibScanner();
  }

  /**
   * Detects which skills are relevant to the project via scan, returns skill names.
   */
  detectRelevantSkills() {
    const files = this.scanner.getFiles(this.projectCwd);
    const seen = new Set();
    for (const file of files) {
      const skill = this.scanner.detectSkill(file);
      if (skill) seen.add(skill);
    }
    return [...seen];
  }

  /**
   * Main entry point. Detects or uses provided skills, then writes context files.
   *
   * @param {object} opts
   * @param {string[]} [opts.skills]  - explicit skill names; auto-detected if omitted
   * @param {string}   opts.target    - 'cursor' | 'claude' | 'copilot' | 'gemini' | 'all' | 'auto'
   * @param {boolean}  [opts.dryRun]  - print what would be written, don't write
   * @param {boolean}  [opts.quiet]   - suppress informational output (e.g. skipped files)
   * @param {function} [opts.onFileConflict] - async callback invoked when a target file already
   *   exists. Receives { filePath, lineCount, hasMarkers } and should return 'skip' to leave the
   *   file untouched, or any other value ('append'|'update') to proceed with the default behavior.
   *   When omitted, existing files are always appended/updated without prompting.
   * @returns {string[]} list of files written
   */
  async init({ skills, target = 'all', dryRun = false, quiet = false, onFileConflict } = {}) {
    const skillNames = skills?.length ? skills : this.detectRelevantSkills();
    if (skillNames.length === 0) {
      throw new Error('No relevant skills detected. Pass --skills explicitly or run booklib index first.');
    }

    const ALL_TARGETS = [
      'claude', 'cursor', 'copilot', 'gemini', 'codex', 'windsurf',
      'roo-code', 'openhands', 'junie', 'goose', 'opencode', 'letta',
    ];
    const targets = target === 'all'
      ? ALL_TARGETS
      : target === 'auto'
      ? new AgentDetector({ cwd: this.projectCwd }).detect()
      : target.split(',').map(t => t.trim());

    const MARKER_START = '<!-- booklib-standards-start -->';
    const MARKER_RE = /<!-- booklib-standards-start -->[\s\S]*?<!-- booklib-standards-end -->/;
    const MARKER_END = '<!-- booklib-standards-end -->';

    const blocks = this._extractBlocks(skillNames);

    const written = [];
    for (const t of targets) {
      let filePath, content, fileHeader;

      ({ filePath, content, fileHeader } = this._render(t, blocks, skillNames));

      const absPath = path.join(this.projectCwd, filePath);
      if (dryRun) {
        console.log(`\n[dry-run] Would write: ${filePath}\n${'─'.repeat(60)}\n${content.slice(0, 400)}…`);
      } else {
        // Conflict detection: when file exists and a callback is provided, let the caller decide
        if (fs.existsSync(absPath) && onFileConflict) {
          const existing = fs.readFileSync(absPath, 'utf8');
          const hasMarkers = existing.includes(MARKER_START);
          const lineCount = existing.split('\n').length;
          const action = await onFileConflict({ filePath, lineCount, hasMarkers });
          if (action === 'skip') {
            if (!quiet) console.log(`  · ${filePath} (skipped)`);
            continue;
          }
          // 'append' or 'update' — fall through to existing write logic
        }
        fs.mkdirSync(path.dirname(absPath), { recursive: true });
        if (fileHeader === null) {
          // booklib owns this file entirely (cursor) — always overwrite
          fs.writeFileSync(absPath, content);
        } else if (fs.existsSync(absPath)) {
          const existing = fs.readFileSync(absPath, 'utf8');
          if (existing.includes(MARKER_START)) {
            // Update only the booklib section, preserve everything else
            fs.writeFileSync(absPath, existing.replace(MARKER_RE, content));
          } else {
            // File exists with no booklib section — append it
            fs.appendFileSync(absPath, `\n\n${content}`);
          }
        } else {
          // New file — write header + booklib section
          fs.writeFileSync(absPath, `${fileHeader}${content}`);
        }
        written.push(filePath);
        if (!quiet) console.log(`  ✅ ${filePath}`);
      }
    }
    return written;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Reads each skill's SKILL.md and extracts framework + pitfall blocks.
   */
  _extractBlocks(skillNames) {
    const blocks = [];
    for (const name of skillNames) {
      const skillPath    = path.join(this.paths.skillsPath, name, 'SKILL.md');
      const cachePath    = path.join(this.paths.cachePath, 'skills', name, 'SKILL.md');
      const bundledPath  = path.join(PACKAGE_ROOT, 'skills', name, 'SKILL.md');
      const mdPath = [skillPath, cachePath, bundledPath].find(p => fs.existsSync(p)) ?? null;
      if (!mdPath) continue;

      const content = fs.readFileSync(mdPath, 'utf8');
      const chunks = parseSkillFile(content, mdPath);

      const framework = chunks.find(c =>
        c.metadata.type === 'framework' || c.metadata.type === 'core_principles'
      )?.text ?? null;

      const pitfalls = chunks.find(c =>
        c.metadata.type === 'pitfalls' || c.metadata.type === 'anti_patterns'
      )?.text ?? null;

      if (framework || pitfalls) {
        blocks.push({ skill: name, framework, pitfalls });
      }
    }
    return blocks;
  }

  /**
   * Resolves the path to a skill's SKILL.md file by checking four locations
   * in priority order: project-local, cached community, bundled, and Claude Code.
   *
   * @param {string} name - skill name (e.g. 'effective-kotlin')
   * @returns {string|null} absolute path to SKILL.md, or null if not found
   */
  _findSkillFile(name) {
    const candidates = [
      path.join(this.paths.skillsPath, name, 'SKILL.md'),
      path.join(this.paths.cachePath, 'skills', name, 'SKILL.md'),
      path.join(PACKAGE_ROOT, 'skills', name, 'SKILL.md'),
      path.join(os.homedir(), '.claude', 'skills', name, 'SKILL.md'),
    ];
    return candidates.find(p => fs.existsSync(p)) ?? null;
  }

  /**
   * Renders extracted blocks into a tool-specific file.
   */
  _render(target, blocks, skillNames) {
    const principles = blocks
      .filter(b => b.framework)
      .map(b => `### From ${b.skill}\n\n${b.framework.trim()}`)
      .join('\n\n---\n\n');

    const antiPatterns = blocks
      .filter(b => b.pitfalls)
      .map(b => `### From ${b.skill}\n\n${b.pitfalls.trim()}`)
      .join('\n\n---\n\n');

    const sources = skillNames.join(', ');
    const generated = `Generated by BookLib from: ${sources}`;

    const toolDocsUrl = TOOL_DOCS[target] ?? '';
    const referencesSection = `
### References

- ${toolDocsUrl ? `[How to customize this file](${toolDocsUrl})` : 'Customize this file for your project'}
- [BookLib documentation](https://booklib-ai.github.io/booklib/)
- [BookLib skills catalog](https://github.com/booklib-ai/booklib)
`;

    switch (target) {
      case 'cursor':
        // booklib owns .cursor/rules/booklib-standards.mdc — full overwrite, fileHeader: null signals that
        return {
          filePath: '.cursor/rules/booklib-standards.mdc',
          fileHeader: null,
          content: `---
description: Coding standards synthesized from ${sources}
alwaysApply: true
---

<!-- ${generated} -->

## Core Principles

${principles || '_No structured principles found in selected skills._'}

## Anti-Patterns to Avoid

${antiPatterns || '_No anti-patterns found in selected skills._'}
${referencesSection}`,
        };

      case 'claude':
        return {
          filePath: 'CLAUDE.md',
          fileHeader: '',
          content: `<!-- booklib-standards-start -->
## Coding Standards

> ${generated}

### Principles

${principles || '_No structured principles found._'}

### Anti-Patterns

${antiPatterns || '_No anti-patterns found._'}
${referencesSection}<!-- booklib-standards-end -->`,
        };

      case 'copilot':
        return {
          filePath: '.github/copilot-instructions.md',
          fileHeader: '# Copilot Instructions\n\n',
          content: `<!-- booklib-standards-start -->
<!-- ${generated} -->

## What to follow

${principles || '_No structured principles found._'}

## What to avoid

${antiPatterns || '_No anti-patterns found._'}
${referencesSection}<!-- booklib-standards-end -->
`,
        };

      case 'gemini':
        return {
          filePath: '.gemini/context.md',
          fileHeader: '# Project Context\n\n',
          content: `<!-- booklib-standards-start -->
<!-- ${generated} -->

## Coding Standards

${principles || '_No structured principles found._'}

## Anti-Patterns

${antiPatterns || '_No anti-patterns found._'}
${referencesSection}<!-- booklib-standards-end -->
`,
        };

      case 'codex':
        return {
          filePath: 'AGENTS.md',
          fileHeader: '# Agent Instructions\n\n',
          content: `<!-- booklib-standards-start -->
<!-- ${generated} -->

## Coding Standards

${principles || '_No structured principles found in selected skills._'}

## Anti-Patterns to Avoid

${antiPatterns || '_No anti-patterns found in selected skills._'}
${referencesSection}<!-- booklib-standards-end -->
`,
        };

      case 'windsurf':
        return {
          filePath: '.windsurfrules',
          fileHeader: '',
          content: `<!-- booklib-standards-start -->
<!-- ${generated} -->

## Core Principles

${principles || '_No structured principles found in selected skills._'}

## Anti-Patterns to Avoid

${antiPatterns || '_No anti-patterns found in selected skills._'}
${referencesSection}<!-- booklib-standards-end -->
`,
        };

      case 'roo-code':
        return {
          filePath: '.roo/rules/booklib-standards.md',
          fileHeader: null,
          content: `<!-- booklib-standards-start -->
<!-- ${generated} -->

## Core Principles

${principles || '_No structured principles found in selected skills._'}

## Anti-Patterns

${antiPatterns || '_No anti-patterns found._'}
${referencesSection}<!-- booklib-standards-end -->
`,
        };

      case 'openhands':
        return {
          filePath: '.openhands/instructions.md',
          fileHeader: '# OpenHands Instructions\n\n',
          content: `<!-- booklib-standards-start -->
<!-- ${generated} -->

## Coding Standards

${principles || '_No structured principles found._'}

## What to Avoid

${antiPatterns || '_No anti-patterns found._'}
${referencesSection}<!-- booklib-standards-end -->
`,
        };

      case 'junie':
        return {
          filePath: '.junie/guidelines.md',
          fileHeader: '# Junie Guidelines\n\n',
          content: `<!-- booklib-standards-start -->
<!-- ${generated} -->

## Principles

${principles || '_No structured principles found._'}

## Anti-Patterns

${antiPatterns || '_No anti-patterns found._'}
${referencesSection}<!-- booklib-standards-end -->
`,
        };

      case 'goose':
        return {
          filePath: '.goose/context.md',
          fileHeader: '# Goose Context\n\n',
          content: `<!-- booklib-standards-start -->
<!-- ${generated} -->

## Standards

${principles || '_No structured principles found._'}

## Avoid

${antiPatterns || '_No anti-patterns found._'}
${referencesSection}<!-- booklib-standards-end -->
`,
        };

      case 'opencode':
        return {
          filePath: '.opencode/instructions.md',
          fileHeader: '# OpenCode Instructions\n\n',
          content: `<!-- booklib-standards-start -->
<!-- ${generated} -->

## Coding Standards

${principles || '_No structured principles found._'}

## Anti-Patterns

${antiPatterns || '_No anti-patterns found._'}
${referencesSection}<!-- booklib-standards-end -->
`,
        };

      case 'letta':
        return {
          filePath: '.letta/skills/booklib.md',
          fileHeader: null,
          content: `<!-- booklib-standards-start -->
<!-- ${generated} -->

# BookLib Knowledge

## Principles

${principles || '_No structured principles found._'}

## Anti-Patterns

${antiPatterns || '_No anti-patterns found._'}
${referencesSection}<!-- booklib-standards-end -->
`,
        };

      default:
        throw new Error(
          `Unknown target: ${target}. Valid values: claude, cursor, copilot, gemini, codex, windsurf, roo-code, openhands, junie, goose, opencode, letta, all, auto`
        );
    }
  }

  /**
   * Returns additional skill names worth knowing about, based on detected skills
   * and project characteristics. Used for discovery hints — NOT injected into CLAUDE.md.
   */
  suggestRelatedSkills(detectedSkills, projectCwd) {
    const suggestions = new Set();
    const packageJsonPath = path.join(projectCwd, 'package.json');
    let pkg = {};
    try { pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')); } catch { /* no package.json */ }
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });

    for (const skill of detectedSkills) {
      if (skill === 'clean-code-reviewer') {
        suggestions.add('node-error-handling');
        if (deps.some(d => ['express', 'fastify', 'koa', 'hono'].includes(d))) {
          suggestions.add('owasp-input-validation');
          suggestions.add('node-security-validation');
        }
      }
      if (skill === 'effective-typescript') {
        suggestions.add('clean-code-reviewer');
        suggestions.add('node-error-handling');
      }
      if (skill === 'effective-python') {
        suggestions.add('django-security');
      }
      if (skill === 'effective-java') {
        suggestions.add('springboot-patterns');
      }
      if (skill === 'effective-kotlin') {
        suggestions.add('kotlin-testing');
      }
    }

    // Remove already-detected skills from suggestions
    for (const s of detectedSkills) suggestions.delete(s);
    return [...suggestions].slice(0, 3);
  }

  // ── ECC Artifact fetching ──────────────────────────────────────────────────

  /**
   * Pulls rules/, agents/, and commands/ from all configured github-skills-dir sources.
   *
   * Sources opt in by including an "artifacts" array in booklib.config.json:
   *   { "type": "github-skills-dir", "repo": "...", "artifacts": ["rules", "agents", "commands"] }
   *
   * When multiple sources export the same artifact type, files are prefixed with the repo
   * slug (last path segment of owner/repo) to avoid collisions.
   *
   * @param {object}   opts
   * @param {string[]|null} [opts.languages]       - language folders for rules/ (null = all)
   * @param {boolean}  [opts.includeAgents]        - pull agents/ → .claude/agents/
   * @param {boolean}  [opts.includeCommands]      - pull commands/ → .claude/commands/
   * @param {boolean}  [opts.dryRun]               - print what would be written without writing
   * @returns {string[]} list of files written
   */
  async fetchEccArtifacts({ languages = null, includeAgents = true, includeCommands = true, dryRun = false } = {}) {
    const artifactSources = this.config.sources.filter(
      s => s.type === 'github-skills-dir' && Array.isArray(s.artifacts) && s.artifacts.length > 0
    );

    if (artifactSources.length === 0) {
      throw new Error(
        'No artifact-capable sources found. Add "artifacts": ["rules","agents","commands"] to a ' +
        'github-skills-dir entry in booklib.config.json.'
      );
    }

    // Determine which artifact types appear in more than one source — those need a prefix.
    const typeCounts = { rules: 0, agents: 0, commands: 0 };
    for (const src of artifactSources) {
      if (src.artifacts.includes('rules'))    typeCounts.rules++;
      if (src.artifacts.includes('agents'))   typeCounts.agents++;
      if (src.artifacts.includes('commands')) typeCounts.commands++;
    }

    const written = [];

    for (const source of artifactSources) {
      const { repo, branch = 'main', artifacts: artifactList } = source;
      // Derive a short slug from the repo name (owner/repo → repo segment)
      const slug = repo.split('/').pop().replace(/[^a-z0-9]/gi, '-').toLowerCase();

      if (languages !== false && artifactList.includes('rules')) {
        const prefix = typeCounts.rules > 1 ? `${slug}-` : '';
        written.push(...await this._pullRules(repo, branch, languages, dryRun, prefix));
      }
      if (includeAgents && artifactList.includes('agents')) {
        const prefix = typeCounts.agents > 1 ? `${slug}-` : '';
        written.push(...await this._pullDir(repo, branch, 'agents', '.claude/agents', dryRun, prefix));
      }
      if (includeCommands && artifactList.includes('commands')) {
        const prefix = typeCounts.commands > 1 ? `${slug}-` : '';
        written.push(...await this._pullDir(repo, branch, 'commands', '.claude/commands', dryRun, prefix));
      }
    }

    return written;
  }

  /** Pulls rules/<language>/*.md → .cursor/rules/[prefix]<language>-<file>.mdc */
  async _pullRules(repo, branch, languages, dryRun, prefix = '') {
    const written = [];
    let langDirs;
    try {
      const entries = await this._fetchJson(`https://api.github.com/repos/${repo}/contents/rules`);
      if (!Array.isArray(entries)) return [];
      langDirs = entries.filter(e => e.type === 'dir').map(e => e.name);
    } catch {
      return [];
    }

    if (languages && languages.length > 0) {
      langDirs = langDirs.filter(d => languages.includes(d));
    }

    for (const lang of langDirs) {
      let files;
      try {
        const entries = await this._fetchJson(`https://api.github.com/repos/${repo}/contents/rules/${lang}`);
        files = Array.isArray(entries) ? entries.filter(e => e.type === 'file' && e.name.endsWith('.md')) : [];
      } catch {
        continue;
      }

      for (const file of files) {
        const rawUrl = `https://raw.githubusercontent.com/${repo}/${branch}/rules/${lang}/${file.name}`;
        const destName = `${prefix}${lang}-${file.name.replace(/\.md$/, '.mdc')}`;
        const destPath = `.cursor/rules/${destName}`;
        const absPath = path.join(this.projectCwd, destPath);

        if (dryRun) {
          console.log(`[dry-run] Would write: ${destPath} (from ${rawUrl})`);
          written.push(destPath);
          continue;
        }

        let content;
        try { content = await this._fetchText(rawUrl); } catch { continue; }

        if (!content.trimStart().startsWith('---')) {
          content = `---\ndescription: ${lang} ${file.name.replace('.md', '')} rules\nalwaysApply: false\n---\n\n${content}`;
        }

        fs.mkdirSync(path.dirname(absPath), { recursive: true });
        fs.writeFileSync(absPath, content);
        console.log(`  ✅ ${destPath}`);
        written.push(destPath);
      }
    }

    return written;
  }

  /** Pulls <srcDir>/*.md → <destDir>/[prefix]<file>.md */
  async _pullDir(repo, branch, srcDir, destDir, dryRun, prefix = '') {
    const written = [];
    let files;
    try {
      const entries = await this._fetchJson(`https://api.github.com/repos/${repo}/contents/${srcDir}`);
      files = Array.isArray(entries) ? entries.filter(e => e.type === 'file' && e.name.endsWith('.md')) : [];
    } catch {
      return [];
    }

    for (const file of files) {
      const rawUrl = `https://raw.githubusercontent.com/${repo}/${branch}/${srcDir}/${file.name}`;
      const destPath = `${destDir}/${prefix}${file.name}`;
      const absPath = path.join(this.projectCwd, destPath);

      if (dryRun) {
        console.log(`[dry-run] Would write: ${destPath} (from ${rawUrl})`);
        written.push(destPath);
        continue;
      }

      let content;
      try { content = await this._fetchText(rawUrl); } catch { continue; }

      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, content);
      console.log(`  ✅ ${destPath}`);
      written.push(destPath);
    }

    return written;
  }

  /**
   * Writes MCP server config files for the selected tools.
   *
   * @param {object}   opts
   * @param {string[]} opts.tools   - tool names: 'claude'|'cursor'|'copilot'|'gemini'|'codex'|'roo-code'|'windsurf'|'goose'|'zed'|'continue'
   * @param {boolean}  [opts.dryRun]
   * @returns {string[]} list of files written
   */
  async generateMcpConfigs({ tools = [], dryRun = false } = {}) {
    const written = [];
    for (const tool of tools) {
      const config = this._renderMcpConfig(tool);
      if (!config) continue;
      const { filePath, mode } = config;
      const absPath = config.global ? filePath : path.join(this.projectCwd, filePath);
      if (dryRun) {
        console.log(`[dry-run] Would write MCP config: ${filePath}`);
        written.push(filePath);
        continue;
      }
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      if (mode === 'json-merge') {
        this._mergeJsonMcpServer(absPath, filePath, config.mcpKey, config.mcpValue);
      } else if (mode === 'toml-merge') {
        this._mergeTomlMcpSection(absPath);
      } else if (mode === 'yaml-merge') {
        this._mergeGooseYaml(absPath);
      } else {
        fs.writeFileSync(absPath, config.content);
      }
      console.log(`  ✅ ${filePath}`);
      written.push(filePath);
    }
    return written;
  }

  /** Returns a descriptor for writing the MCP config for a given tool. */
  _renderMcpConfig(tool) {
    const BOOKLIB_ENTRY = { command: 'booklib-mcp', args: [] };
    switch (tool) {
      case 'claude':
        return { filePath: '.claude/settings.json',  mode: 'json-merge', mcpKey: ['mcpServers', 'booklib'],          mcpValue: BOOKLIB_ENTRY };
      case 'cursor':
        return { filePath: '.cursor/mcp.json',        mode: 'json-merge', mcpKey: ['mcpServers', 'booklib'],         mcpValue: BOOKLIB_ENTRY };
      case 'copilot':
        return { filePath: '.vscode/mcp.json',        mode: 'json-merge', mcpKey: ['servers', 'booklib'],            mcpValue: BOOKLIB_ENTRY };
      case 'gemini':
        return { filePath: '.gemini/settings.json',   mode: 'json-merge', mcpKey: ['mcpServers', 'booklib'],         mcpValue: BOOKLIB_ENTRY };
      case 'codex':
        return { filePath: '.codex/config.toml',      mode: 'toml-merge' };
      case 'roo-code':
        return { filePath: '.roo/mcp.json',            mode: 'json-merge', mcpKey: ['mcpServers', 'booklib'],        mcpValue: BOOKLIB_ENTRY };
      case 'windsurf': {
        const windsurfPath = path.join(os.homedir(), '.codeium', 'windsurf', 'mcp_config.json');
        return { filePath: windsurfPath,              mode: 'json-merge', mcpKey: ['mcpServers', 'booklib'],         mcpValue: BOOKLIB_ENTRY, global: true };
      }
      case 'goose':
        return { filePath: '.goose/config.yaml',      mode: 'yaml-merge' };
      case 'zed':
        return { filePath: '.zed/settings.json',      mode: 'json-merge', mcpKey: ['context_servers', 'booklib-mcp'], mcpValue: { command: { path: 'booklib-mcp', args: [] } } };
      case 'continue':
        return { filePath: '.continue/mcpServers/booklib.yaml', mode: 'overwrite', content: 'name: booklib\ncommand: booklib-mcp\nargs: []\n' };
      default:
        return null;
    }
  }

  /** Reads an existing JSON config (if any), sets keyPath to value, writes back. */
  _mergeJsonMcpServer(absPath, filePath, keyPath, value) {
    let root = {};
    if (fs.existsSync(absPath)) {
      try {
        root = JSON.parse(fs.readFileSync(absPath, 'utf8'));
      } catch {
        console.warn(`  ⚠️  Could not parse ${filePath} — writing fresh`);
        root = {};
      }
    }
    let node = root;
    for (let i = 0; i < keyPath.length - 1; i++) {
      if (!node[keyPath[i]] || typeof node[keyPath[i]] !== 'object') node[keyPath[i]] = {};
      node = node[keyPath[i]];
    }
    node[keyPath[keyPath.length - 1]] = value;
    fs.writeFileSync(absPath, JSON.stringify(root, null, 2) + '\n');
  }

  /** Appends or replaces the [mcp_servers.booklib] section in a TOML file. */
  _mergeTomlMcpSection(absPath) {
    const BOOKLIB_BLOCK = '[mcp_servers.booklib]\ncommand = "booklib-mcp"\nargs = []\n';
    // Match from the section header to the next section header or end of string
    const SECTION_RE = /\[mcp_servers\.booklib\][\s\S]*?(?=\n\[|$)/;

    let existing = '';
    if (fs.existsSync(absPath)) {
      existing = fs.readFileSync(absPath, 'utf8');
    }

    if (SECTION_RE.test(existing)) {
      fs.writeFileSync(absPath, existing.replace(SECTION_RE, BOOKLIB_BLOCK.trimEnd()));
    } else {
      fs.writeFileSync(absPath, existing + (existing.endsWith('\n') ? '' : '\n') + '\n' + BOOKLIB_BLOCK);
    }
  }

  /** Appends or merges the booklib entry in a Goose YAML config. */
  _mergeGooseYaml(absPath) {
    const entry = '\nmcp_servers:\n  booklib:\n    command: booklib-mcp\n    args: []\n';
    if (fs.existsSync(absPath)) {
      const content = fs.readFileSync(absPath, 'utf8');
      if (content.includes('booklib:')) return; // already exists
      if (content.includes('mcp_servers:')) {
        // Append under existing mcp_servers section
        const updated = content.replace('mcp_servers:', 'mcp_servers:\n  booklib:\n    command: booklib-mcp\n    args: []');
        fs.writeFileSync(absPath, updated);
      } else {
        fs.appendFileSync(absPath, entry);
      }
    } else {
      fs.writeFileSync(absPath, entry.trim() + '\n');
    }
  }

  // ── HTTP helpers ───────────────────────────────────────────────────────────

  _fetchJson(url) {
    return new Promise((resolve, reject) => {
      https.get(url, { headers: { 'User-Agent': 'booklib-init/1.0' } }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(this._fetchJson(res.headers.location));
        }
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON')); }
        });
      }).on('error', reject);
    });
  }

  _fetchText(url) {
    return new Promise((resolve, reject) => {
      https.get(url, { headers: { 'User-Agent': 'booklib-init/1.0' } }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(this._fetchText(res.headers.location));
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          res.resume();
          return;
        }
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
  }
}
